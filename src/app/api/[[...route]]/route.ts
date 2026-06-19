import { handle } from "hono/vercel";
import { app } from "@/server/app";

// Next.js (App Router) の Route Handler エントリポイント。
// Hono アプリ本体は src/server/app.ts に定義し、ここでは各メソッドに束ねるだけ。
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
