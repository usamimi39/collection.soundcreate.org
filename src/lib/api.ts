// UI（クライアントコンポーネント）から呼ぶための、型安全なロジック層。
// スタイリングはUI側に任せ、API通信・エラー整形だけをここに集約する。
import { client } from "./rpc";

/**
 * ライセンスキーを検証し、成功すればこのブラウザの本棚に追加する。
 * 戻り値の判別は `result.ok` で行う（false の場合 `result.error` に種別）。
 */
export async function verifyLicense(licenseKey: string) {
  const res = await client.api.licenses.verify.$post({ json: { licenseKey } });
  return res.json();
}

/** 本棚（このブラウザが所有するコンテンツ一覧）を取得する。 */
export async function fetchLibrary() {
  const res = await client.api.library.$get();
  const data = await res.json();
  return data.items;
}

/** ダウンロード用URL。<a href={...} download> やブラウザ遷移で利用する。 */
export function downloadUrl(contentId: string): string {
  return `/api/contents/${encodeURIComponent(contentId)}/download`;
}

/** ジャケット画像URL。<img src={...}> で利用する。 */
export function jacketUrl(contentId: string): string {
  return `/api/contents/${encodeURIComponent(contentId)}/jacket`;
}
