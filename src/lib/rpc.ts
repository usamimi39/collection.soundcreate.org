import { hc } from "hono/client";
import type { AppType } from "@/server/app";

// 型安全な Hono RPC クライアント。
// バックエンドの route 定義 (AppType) を共有することで、
// パス・パラメータ・レスポンス型がコンパイル時に検証される。
//
// 使い方:
//   const res = await client.api.health.$get();
//   const data = await res.json(); // 型が推論される
export const client = hc<AppType>(
  typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
);
