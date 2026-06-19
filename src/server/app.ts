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

// Honoバックエンド本体。Next.js の Route Handler から handle() 経由で呼ばれる。
// Cloudflare バインディング(D1: env.DB / R2: env.BUCKET / RATE_LIMITER)へは
// getCloudflareContext().env からアクセスする。
const app = new Hono().basePath("/api");

// メソッドチェーンで定義することで routes の型を AppType として書き出し、
// フロント側の hono/client (RPC) で型安全に呼び出せるようにする。
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
        return c.json({ ok: false, error: "rate_limited" as const }, 429);
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
      return c.json({ ok: false, error: "invalid_request" as const }, 400);
    }
    const licenseKey = normalizeLicenseKey(raw);
    if (!isValidLicenseKey(licenseKey)) {
      return c.json({ ok: false, error: "invalid_format" as const }, 400);
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
      return c.json({ ok: false, error: "not_found" as const }, 404);
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
            ok: false,
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
  });

export type AppType = typeof routes;
export { app };
