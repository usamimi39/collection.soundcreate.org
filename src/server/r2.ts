import { AwsClient } from "aws4fetch";

// R2バケット名（wrangler.jsonc の r2_buckets.bucket_name と一致させる）。
const BUCKET_NAME = "collection-audio";

// Presigned URL の有効期間（秒）。アップロード用に15分。
export const PRESIGN_EXPIRES_IN = 15 * 60;

// アップロード種別ごとのオブジェクトキーの配置先。
const KIND_PREFIX = {
  jacket: "jackets",
  download: "downloads",
} as const;

export type UploadKind = keyof typeof KIND_PREFIX;

type R2Credentials = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};

/** ファイル名から拡張子（先頭ドット込み）を安全に取り出す。 */
function extensionOf(filename: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

/** アップロード種別とファイル名から、衝突しないオブジェクトキーを生成する。 */
export function buildObjectKey(kind: UploadKind, filename: string): string {
  return `${KIND_PREFIX[kind]}/${crypto.randomUUID()}${extensionOf(filename)}`;
}

/**
 * R2 への PUT 用 Presigned URL を生成する。
 * クライアントはこの URL に対し `fetch(url, { method: "PUT", body: file })` で
 * 直接アップロードする（Worker を経由しないため大容量でも制限に当たらない）。
 *
 * 署名はクエリ方式（signQuery）で行い、Content-Type 等の追加ヘッダは
 * 署名対象に含めない（ブラウザ側が任意に付与してそのまま保存される）。
 */
export async function presignPutUrl(
  env: R2Credentials,
  objectKey: string,
  expiresIn: number = PRESIGN_EXPIRES_IN,
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${objectKey}`;
  const signed = await client.sign(
    new Request(`${endpoint}?X-Amz-Expires=${expiresIn}`, { method: "PUT" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}
