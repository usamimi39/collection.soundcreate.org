import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isValidLicenseKey, normalizeLicenseKey } from "@/lib/keys";
import {
  DEVICE_TOKEN_COOKIE,
  DEVICE_TOKEN_MAX_AGE,
  deviceLabelFromUserAgent,
  generateDeviceToken,
} from "@/lib/device";

// 本棚に並ぶ1コンテンツ分の表示情報（/api/library のレスポンス要素）。
type LibraryItem = {
  id: string;
  title: string;
  downloadAvailable: boolean;
};

// 所有検証クエリの戻り（download/jacket 配信で共有）。
type OwnedContent = {
  id: string;
  title: string;
  downloadKey: string | null;
  jacketKey: string;
};

/**
 * 指定ブラウザ(device_token)が当該コンテンツを所有しているか確認し、
 * 所有していれば配信に必要なR2キーを返す。未所有なら null。
 * devices → licenses → contents のJOINで「キーを有効化済みか」を判定する。
 */
async function findOwnedContent(
  db: D1Database,
  deviceToken: string,
  contentId: string,
): Promise<OwnedContent | null> {
  return db
    .prepare(
      `SELECT c.id AS id, c.title AS title,
              c.download_object_key AS downloadKey, c.jacket_object_key AS jacketKey
         FROM devices d
         JOIN licenses l ON l.license_key = d.license_key
         JOIN contents c ON c.id = l.content_id
        WHERE d.device_token = ? AND c.id = ?
        LIMIT 1`,
    )
    .bind(deviceToken, contentId)
    .first<OwnedContent>();
}

/**
 * Content-Disposition: attachment ヘッダを組み立てる。
 * 日本語等の非ASCIIファイル名は filename*（RFC 5987）で渡し、
 * 互換のため ASCII フォールバックも併記する。
 */
function attachmentHeader(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Honoバックエンド本体。Next.js の Route Handler から handle() 経由で呼ばれる。
// Cloudflare バインディング(D1: env.DB / R2: env.BUCKET / RATE_LIMITER)へは
// getCloudflareContext().env からアクセスする。
const app = new Hono().basePath("/api");

// メソッドチェーンで定義することで routes の型を AppType として書き出し、
// フロント側の hono/client (RPC) で型安全に呼び出せるようにする。
// （routes は値としては未使用だが typeof で型を取るために必要）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .get("/health", (c) => {
    const { env } = getCloudflareContext();
    return c.json({
      status: "ok" as const,
      bindings: {
        db: typeof env.DB !== "undefined",
        bucket: typeof env.BUCKET !== "undefined",
        rateLimiter: typeof env.RATE_LIMITER !== "undefined",
      },
    });
  })
  // ────────────────────────────────────────────────────────────────
  // ライセンスキー検証。
  // 1. IP単位のレート制限（総当たり対策）
  // 2. キー形式・存在チェック
  // 3. ブラウザ識別子(device_token)を Cookie から取得 or 新規発行
  // 4. (license_key, device_token) の紐付けを devices に登録（3台制限を判定）
  // 5. HttpOnly Cookie を発行/更新し、本棚に追加されたコンテンツを返す
  // ────────────────────────────────────────────────────────────────
  .post("/licenses/verify", async (c) => {
    const { env } = getCloudflareContext();

    // 1. レート制限（本番のみ。ローカルdevでバインド未提供の場合はスキップ）
    if (env.RATE_LIMITER) {
      const ip =
        c.req.header("CF-Connecting-IP") ??
        c.req.header("x-forwarded-for") ??
        "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: `verify:${ip}` });
      if (!success) {
        return c.json({ ok: false as const, error: "rate_limited" as const }, 429);
      }
    }

    // 2. 入力の取得・正規化・形式検証
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const raw = (body as { licenseKey?: unknown } | null)?.licenseKey;
    if (typeof raw !== "string") {
      return c.json({ ok: false as const, error: "invalid_request" as const }, 400);
    }
    const licenseKey = normalizeLicenseKey(raw);
    if (!isValidLicenseKey(licenseKey)) {
      return c.json({ ok: false as const, error: "invalid_format" as const }, 400);
    }

    // キー存在チェック（紐づくコンテンツも併せて取得）
    const license = await env.DB.prepare(
      `SELECT l.license_key AS licenseKey, l.max_devices AS maxDevices,
              c.id AS contentId, c.title AS title, c.jacket_object_key AS jacketObjectKey
         FROM licenses l
         JOIN contents c ON c.id = l.content_id
        WHERE l.license_key = ?`,
    )
      .bind(licenseKey)
      .first<{
        licenseKey: string;
        maxDevices: number;
        contentId: string;
        title: string;
        jacketObjectKey: string;
      }>();

    if (!license) {
      return c.json({ ok: false as const, error: "not_found" as const }, 404);
    }

    // 3. ブラウザ識別子。既存Cookieがあれば本棚を共有するため再利用する。
    let deviceToken = getCookie(c, DEVICE_TOKEN_COOKIE);
    const isNewBrowser = !deviceToken;
    if (!deviceToken) {
      deviceToken = generateDeviceToken();
    }

    // 4. 既に同じ (license_key, device_token) が紐付いていれば冪等に再認証。
    const existing = await env.DB.prepare(
      `SELECT id FROM devices WHERE license_key = ? AND device_token = ?`,
    )
      .bind(licenseKey, deviceToken)
      .first<{ id: string }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE devices SET last_seen_at = strftime('%s','now') WHERE id = ?`,
      )
        .bind(existing.id)
        .run();
    } else {
      // 新規紐付け。3台制限（ライブ集計）を判定。
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM devices WHERE license_key = ?`,
      )
        .bind(licenseKey)
        .first<{ cnt: number }>();
      const count = countRow?.cnt ?? 0;
      if (count >= license.maxDevices) {
        // 枠が埋まっている。Cookieは変更しない（他の所有CDには影響させない）。
        return c.json(
          {
            ok: false as const,
            error: "device_limit_reached" as const,
            maxDevices: license.maxDevices,
          },
          403,
        );
      }
      const label = deviceLabelFromUserAgent(c.req.header("User-Agent"));
      await env.DB.prepare(
        `INSERT INTO devices (id, license_key, device_token, label, last_seen_at)
         VALUES (?, ?, ?, ?, strftime('%s','now'))`,
      )
        .bind(crypto.randomUUID(), licenseKey, deviceToken, label)
        .run();
    }

    // 5. Cookie を発行/更新（HttpOnly。localhost等のhttpではSecureを外す）。
    setCookie(c, DEVICE_TOKEN_COOKIE, deviceToken, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: DEVICE_TOKEN_MAX_AGE,
    });

    return c.json({
      ok: true as const,
      newBrowser: isNewBrowser,
      content: {
        id: license.contentId,
        title: license.title,
        jacketObjectKey: license.jacketObjectKey,
      },
    });
  })
  // ────────────────────────────────────────────────────────────────
  // 本棚（コレクション）。Cookieの device_token に紐付く所有コンテンツ一覧。
  // Cookie が無い（＝まだ何も認証していない）場合は空配列を返す。
  // ────────────────────────────────────────────────────────────────
  .get("/library", async (c) => {
    const { env } = getCloudflareContext();
    const deviceToken = getCookie(c, DEVICE_TOKEN_COOKIE);
    if (!deviceToken) {
      return c.json({ ok: true as const, items: [] as LibraryItem[] });
    }
    const { results } = await env.DB.prepare(
      `SELECT c.id AS id, c.title AS title,
              CASE WHEN c.download_object_key IS NOT NULL THEN 1 ELSE 0 END AS downloadAvailable
         FROM devices d
         JOIN licenses l ON l.license_key = d.license_key
         JOIN contents c ON c.id = l.content_id
        WHERE d.device_token = ?
        GROUP BY c.id
        ORDER BY MAX(d.created_at) DESC`,
    )
      .bind(deviceToken)
      .all<{ id: string; title: string; downloadAvailable: number }>();
    const items: LibraryItem[] = results.map((r) => ({
      id: r.id,
      title: r.title,
      downloadAvailable: r.downloadAvailable === 1,
    }));
    return c.json({ ok: true as const, items });
  })
  // ────────────────────────────────────────────────────────────────
  // 一括ダウンロード（zip）。所有検証 → R2から取得しWorker経由でストリーム返却。
  // UI からは <a href="/api/contents/{id}/download"> で直接叩ける。
  // （配信方式を後でPresigned URLの302に差し替えてもUIは無変更で済む）
  // ────────────────────────────────────────────────────────────────
  .get("/contents/:id/download", async (c) => {
    const { env } = getCloudflareContext();
    const deviceToken = getCookie(c, DEVICE_TOKEN_COOKIE);
    if (!deviceToken) {
      return c.json({ ok: false as const, error: "unauthorized" as const }, 401);
    }
    const owned = await findOwnedContent(env.DB, deviceToken, c.req.param("id"));
    if (!owned) {
      return c.json({ ok: false as const, error: "not_owned" as const }, 403);
    }
    if (!owned.downloadKey) {
      return c.json({ ok: false as const, error: "download_not_ready" as const }, 409);
    }
    const obj = await env.BUCKET.get(owned.downloadKey);
    if (!obj) {
      return c.json({ ok: false as const, error: "file_missing" as const }, 404);
    }
    const headers = new Headers();
    headers.set(
      "Content-Type",
      obj.httpMetadata?.contentType ?? "application/zip",
    );
    headers.set("Content-Length", obj.size.toString());
    headers.set("Content-Disposition", attachmentHeader(`${owned.title}.zip`));
    headers.set("ETag", obj.httpEtag);
    headers.set("Cache-Control", "private, no-store");
    return new Response(obj.body, { headers });
  })
  // ────────────────────────────────────────────────────────────────
  // ジャケット画像。所有検証 → R2から取得しWorker経由で返却。
  // UI からは <img src="/api/contents/{id}/jacket"> で表示できる。
  // ────────────────────────────────────────────────────────────────
  .get("/contents/:id/jacket", async (c) => {
    const { env } = getCloudflareContext();
    const deviceToken = getCookie(c, DEVICE_TOKEN_COOKIE);
    if (!deviceToken) {
      return c.json({ ok: false as const, error: "unauthorized" as const }, 401);
    }
    const owned = await findOwnedContent(env.DB, deviceToken, c.req.param("id"));
    if (!owned) {
      return c.json({ ok: false as const, error: "not_owned" as const }, 403);
    }
    const obj = await env.BUCKET.get(owned.jacketKey);
    if (!obj) {
      return c.json({ ok: false as const, error: "file_missing" as const }, 404);
    }
    const headers = new Headers();
    headers.set(
      "Content-Type",
      obj.httpMetadata?.contentType ?? "image/jpeg",
    );
    headers.set("Content-Length", obj.size.toString());
    headers.set("ETag", obj.httpEtag);
    headers.set("Cache-Control", "private, max-age=3600");
    return new Response(obj.body, { headers });
  });

export type AppType = typeof routes;
export { app };
