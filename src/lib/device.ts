// 本棚（コレクション）へのアクセス権を表すブラウザ識別子まわりの共通ロジック。

/** device_token を保存する Cookie 名。 */
export const DEVICE_TOKEN_COOKIE = "device_token";

/** Cookie の有効期間（秒）。ブラウザの上限に合わせ約400日。 */
export const DEVICE_TOKEN_MAX_AGE = 60 * 60 * 24 * 400;

/**
 * ブラウザ識別子（device_token）を生成する。
 * 本棚へのアクセスを許可する実質的なベアラトークンのため、高エントロピーな秘密値とする。
 */
export function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * User-Agent から人が読めるデバイスラベルを推定する。
 * 将来の「デバイス認証解除」UIで、どの端末かを識別する補助に使う（任意項目）。
 */
export function deviceLabelFromUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  // Chrome の UA には "Safari" も含まれるため、判定順に注意。
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}
