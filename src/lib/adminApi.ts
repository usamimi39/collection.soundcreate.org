// 管理画面UI用のロジック層。スタイリングはUIに任せ、通信・アップロード手順を集約。
import { client } from "./rpc";

export type ContentSummary = {
  id: string;
  title: string;
  createdAt: number;
};

/**
 * Presigned PUT を取得し、ファイルを R2 へ直接アップロードして
 * 保存先オブジェクトキーを返す（Worker を経由しない直アップロード）。
 */
async function presignAndUpload(
  kind: "jacket" | "download",
  file: File,
): Promise<string> {
  const res = await client.api.admin.uploads.presign.$post({
    json: { kind, filename: file.name },
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error("署名付きURLの取得に失敗しました");
  }
  const put = await fetch(data.url, {
    method: "PUT",
    body: file,
    headers: file.type ? { "Content-Type": file.type } : undefined,
  });
  if (!put.ok) {
    throw new Error(`R2へのアップロードに失敗しました (HTTP ${put.status})`);
  }
  return data.objectKey;
}

/**
 * コンテンツを作成する。ジャケット（必須）と一括DL用zip（任意）を
 * 先に R2 へアップロードし、得たキーで contents 行を作る。
 */
export async function createContent(input: {
  title: string;
  jacket: File;
  download: File | null;
}) {
  const jacketObjectKey = await presignAndUpload("jacket", input.jacket);
  const downloadObjectKey = input.download
    ? await presignAndUpload("download", input.download)
    : undefined;
  const res = await client.api.admin.contents.$post({
    json: { title: input.title, jacketObjectKey, downloadObjectKey },
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error("コンテンツの作成に失敗しました");
  }
  return data;
}

/** コンテンツ一覧を取得（キー発行のプルダウン用）。 */
export async function listContents(): Promise<ContentSummary[]> {
  const res = await client.api.admin.contents.$get();
  const data = await res.json();
  return data.ok ? data.contents : [];
}

/** ライセンスキーを一括発行する。戻り値は result.ok で判別。 */
export async function issueLicenses(input: {
  contentId: string;
  label: string;
  count: number;
}) {
  const res = await client.api.admin.licenses.issue.$post({ json: input });
  return res.json();
}

/** 発行ロットのCSVダウンロードURL（<a href> やブラウザ遷移で利用）。 */
export function batchCsvUrl(batchId: string): string {
  return `/api/admin/batches/${encodeURIComponent(batchId)}/export`;
}
