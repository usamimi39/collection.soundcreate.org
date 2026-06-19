"use client";

import { downloadUrl, jacketUrl } from "@/lib/api";

export type BookshelfItem = {
  id: string;
  title: string;
  downloadAvailable: boolean;
};

/**
 * 本棚（コレクション）表示。
 * jacket は <img src={jacketUrl(id)}>、DLは <a href={downloadUrl(id)}> で
 * Workerプロキシ経由の保護されたエンドポイントを直接叩く。
 * ── ロジックは完成済み。グリッドや見た目だけ調整してください。
 */
export function Bookshelf({
  items,
  loading,
}: {
  items: BookshelfItem[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-zinc-500">読み込み中…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        まだ何もありません。お持ちのライセンスキーを入力してください。
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2">
          {/* 私有R2のプロキシ画像のため next/image ではなく素の img を使用 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={jacketUrl(item.id)}
            alt={item.title}
            loading="lazy"
            className="aspect-square w-full rounded object-cover"
          />
          <h3 className="text-sm font-medium">{item.title}</h3>
          {item.downloadAvailable ? (
            <a
              href={downloadUrl(item.id)}
              className="rounded bg-black px-3 py-1.5 text-center text-sm text-white"
            >
              ダウンロード
            </a>
          ) : (
            <span className="text-center text-sm text-zinc-400">準備中</span>
          )}
        </li>
      ))}
    </ul>
  );
}
