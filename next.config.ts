import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// `next dev` 実行時に Cloudflare バインディング(D1/R2 等)を
// getCloudflareContext() 経由で利用できるようにする。
initOpenNextCloudflareForDev();
