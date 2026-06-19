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
