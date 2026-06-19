import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // ISR/キャッシュの保存先に R2 を利用する。
  // 静的アセット用の R2 バインディングは OpenNext が内部で扱う。
  incrementalCache: r2IncrementalCache,
});
