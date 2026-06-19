import { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { generateLicenseKey } from "@/lib/keys";
import { attachmentHeader } from "@/lib/http";
import {
  buildObjectKey,
  presignPutUrl,
  type UploadKind,
} from "@/server/r2";

// 一括発行の上限（暴発防止）。
const MAX_ISSUE_COUNT = 1000;
const UPLOAD_KINDS: UploadKind[] = ["jacket", "download"];

/** 重複しないライセンスキーを count 件生成する（メモリ内で一意性を確保）。 */
function generateUniqueKeys(count: number): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    set.add(generateLicenseKey());
  }
  return [...set];
}

/** CSV 1セルのエスケープ（ダブルクオート囲み）。 */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// ────────────────────────────────────────────────────────────────
// 管理API。/api/admin 配下にマウントされる。
// ※ 保護は Cloudflare Access（ルーティング層）で行う前提。
//    アプリ側に認証は実装していない（仕様の通り）。
//    デプロイ前に必ず /admin・/api/admin/* を Access で遮断すること。
// ────────────────────────────────────────────────────────────────
const adminApp = new Hono()
  // コンテンツ一覧（キー発行のプルダウン等に使う）。
  .get("/contents", async (c) => {
    const { env } = getCloudflareContext();
    const { results } = await env.DB.prepare(
      `SELECT id, title, created_at AS createdAt FROM contents ORDER BY created_at DESC`,
    ).all<{ id: string; title: string; createdAt: number }>();
    return c.json({ ok: true as const, contents: results });
  })
  // アップロード用 Presigned PUT URL を発行。
  // body: { kind: "jacket" | "download", filename: string }
  .post("/uploads/presign", async (c) => {
    const { env } = getCloudflareContext();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const { kind, filename } = (body ?? {}) as {
      kind?: unknown;
      filename?: unknown;
    };
    if (
      typeof kind !== "string" ||
      !UPLOAD_KINDS.includes(kind as UploadKind) ||
      typeof filename !== "string" ||
      filename.length === 0
    ) {
      return c.json({ ok: false as const, error: "invalid_request" as const }, 400);
    }
    const objectKey = buildObjectKey(kind as UploadKind, filename);
    const url = await presignPutUrl(env, objectKey);
    return c.json({ ok: true as const, url, objectKey });
  })
  // コンテンツ作成（アップロード済みのオブジェクトキーを受け取り行を作る）。
  // body: { title, jacketObjectKey, downloadObjectKey? }
  .post("/contents", async (c) => {
    const { env } = getCloudflareContext();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const { title, jacketObjectKey, downloadObjectKey } = (body ?? {}) as {
      title?: unknown;
      jacketObjectKey?: unknown;
      downloadObjectKey?: unknown;
    };
    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      typeof jacketObjectKey !== "string" ||
      jacketObjectKey.length === 0
    ) {
      return c.json({ ok: false as const, error: "invalid_request" as const }, 400);
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO contents (id, title, jacket_object_key, download_object_key)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(
        id,
        title.trim(),
        jacketObjectKey,
        typeof downloadObjectKey === "string" && downloadObjectKey.length > 0
          ? downloadObjectKey
          : null,
      )
      .run();
    return c.json({ ok: true as const, id, title: title.trim() });
  })
  // ライセンスキーの一括発行。
  // body: { contentId, label, count } → batch を作り licenses を一括INSERT。
  .post("/licenses/issue", async (c) => {
    const { env } = getCloudflareContext();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const { contentId, label, count } = (body ?? {}) as {
      contentId?: unknown;
      label?: unknown;
      count?: unknown;
    };
    const issueCount =
      typeof count === "number" ? Math.floor(count) : Number.NaN;
    if (
      typeof contentId !== "string" ||
      typeof label !== "string" ||
      label.trim().length === 0 ||
      !Number.isFinite(issueCount) ||
      issueCount < 1 ||
      issueCount > MAX_ISSUE_COUNT
    ) {
      return c.json({ ok: false as const, error: "invalid_request" as const }, 400);
    }

    // FK は D1 で既定オフのため、存在チェックを明示的に行う。
    const content = await env.DB.prepare(
      `SELECT id FROM contents WHERE id = ?`,
    )
      .bind(contentId)
      .first<{ id: string }>();
    if (!content) {
      return c.json({ ok: false as const, error: "content_not_found" as const }, 404);
    }

    // 既存キーとの衝突は極めて稀。万一 UNIQUE 制約で失敗したら
    // 新しいキー一式で batch ごと再試行する（D1 batch は原子的）。
    const label_ = label.trim();
    for (let attempt = 0; attempt < 3; attempt++) {
      const batchId = crypto.randomUUID();
      const keys = generateUniqueKeys(issueCount);
      const stmts = [
        env.DB.prepare(
          `INSERT INTO batches (id, label, content_id) VALUES (?, ?, ?)`,
        ).bind(batchId, label_, contentId),
        ...keys.map((k) =>
          env.DB.prepare(
            `INSERT INTO licenses (license_key, content_id, batch_id) VALUES (?, ?, ?)`,
          ).bind(k, contentId, batchId),
        ),
      ];
      try {
        await env.DB.batch(stmts);
        return c.json({ ok: true as const, batchId, label: label_, keys });
      } catch (e) {
        if (attempt === 2) throw e;
        // UNIQUE 衝突とみなし再試行
      }
    }
    // 到達しない（ループ内で return / throw する）が型のため。
    return c.json({ ok: false as const, error: "issue_failed" as const }, 500);
  })
  // 発行ロットのCSV出力（license_key, content_title）。
  .get("/batches/:id/export", async (c) => {
    const { env } = getCloudflareContext();
    const batchId = c.req.param("id");
    const batch = await env.DB.prepare(
      `SELECT label FROM batches WHERE id = ?`,
    )
      .bind(batchId)
      .first<{ label: string }>();
    if (!batch) {
      return c.json({ ok: false as const, error: "not_found" as const }, 404);
    }
    const { results } = await env.DB.prepare(
      `SELECT l.license_key AS licenseKey, c.title AS title
         FROM licenses l
         JOIN contents c ON c.id = l.content_id
        WHERE l.batch_id = ?
        ORDER BY l.created_at`,
    )
      .bind(batchId)
      .all<{ licenseKey: string; title: string }>();

    const header = "license_key,content_title";
    const rows = results.map(
      (r) => `${csvCell(r.licenseKey)},${csvCell(r.title)}`,
    );
    // Excel等での文字化け防止に BOM を付与。
    const csv = "﻿" + [header, ...rows].join("\r\n") + "\r\n";

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": attachmentHeader(`${batch.label}.csv`),
        "Cache-Control": "no-store",
      },
    });
  });

export { adminApp };
