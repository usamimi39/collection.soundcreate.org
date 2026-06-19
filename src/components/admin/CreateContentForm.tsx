"use client";

import { useState, type FormEvent } from "react";
import { createContent } from "@/lib/adminApi";

/**
 * コンテンツ作成フォーム（タイトル＋ジャケット画像＋一括DL用zip）。
 * ジャケット・zip は Presigned PUT で R2 へ直接アップロードしてから登録する。
 * ── ロジックは完成済み。見た目だけ調整してください。
 */
export function CreateContentForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [jacket, setJacket] = useState<File | null>(null);
  const [download, setDownload] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!title.trim() || !jacket) {
      setError("タイトルとジャケット画像は必須です。");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createContent({ title: title.trim(), jacket, download });
      setMessage(`コンテンツを作成しました（id: ${result.id}）。`);
      setTitle("");
      setJacket(null);
      setDownload(null);
      // ファイル入力の表示リセット
      (e.target as HTMLFormElement).reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="content-title" className="text-sm font-medium">
          タイトル
        </label>
        <input
          id="content-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="content-jacket" className="text-sm font-medium">
          ジャケット画像（必須・1000×1000px以下推奨）
        </label>
        <input
          id="content-jacket"
          type="file"
          accept="image/*"
          onChange={(e) => setJacket(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="content-zip" className="text-sm font-medium">
          一括ダウンロード用zip（任意）
        </label>
        <input
          id="content-zip"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setDownload(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "アップロード中…" : "コンテンツを作成"}
      </button>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
