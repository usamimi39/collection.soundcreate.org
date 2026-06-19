// ライセンスキーの形式定義。
// 同人CD向け: 英大文字+数字の 4桁+4桁（例: A1B2-C3D4）。
// 見間違い防止のため英字は全て大文字。
export const LICENSE_KEY_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** 入力値が正しいライセンスキー形式かを検証する。 */
export function isValidLicenseKey(value: string): boolean {
  return LICENSE_KEY_REGEX.test(value);
}

/** ユーザー入力を正規化する（前後空白除去・大文字化）。 */
export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

// キー生成に使う文字集合。見間違いやすい I, O, L, 0, 1 を除外（31文字）。
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// 31 は 256 を割り切らないため、モジュロバイアスを避ける棄却サンプリングを行う。
// 256 以下で 31 の倍数の最大値（= 31*8）未満のバイトのみ採用する。
const REJECT_THRESHOLD =
  Math.floor(256 / KEY_ALPHABET.length) * KEY_ALPHABET.length;

function randomSegment(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= REJECT_THRESHOLD) continue;
      out += KEY_ALPHABET[b % KEY_ALPHABET.length];
    }
  }
  return out;
}

/**
 * ライセンスキーを1件生成する（例: A1B2-C3D4 形式の 4桁+4桁）。
 * 一意性は呼び出し側で UNIQUE 制約＋衝突時の再生成により担保する。
 */
export function generateLicenseKey(): string {
  return `${randomSegment(4)}-${randomSegment(4)}`;
}
