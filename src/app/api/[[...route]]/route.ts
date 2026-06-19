import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Honoバックエンドのエントリポイント。
// Next.js の Route Handler (App Router) 上で動作し、/api/* を捌く。
//
// Cloudflare バインディング(D1: env.DB / R2: env.BUCKET)へは
// getCloudflareContext().env からアクセスする。
// （hono/vercel アダプタは c.env を注入しないため、こちらを使う）
const app = new Hono().basePath("/api");

// メソッドチェーンで定義した routes の型を AppType として書き出し、
// フロント側の hono/client (RPC) に渡すことで型安全な API 呼び出しを実現する。
const routes = app.get("/health", (c) => {
  const { env } = getCloudflareContext();
  return c.json({
    status: "ok" as const,
    bindings: {
      db: typeof env.DB !== "undefined",
      bucket: typeof env.BUCKET !== "undefined",
    },
  });
});

export type AppType = typeof routes;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
