/**
 * Content-Disposition: attachment ヘッダを組み立てる。
 * 日本語等の非ASCIIファイル名は filename*（RFC 5987）で渡し、
 * 互換のため ASCII フォールバックも併記する。
 */
export function attachmentHeader(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
