"use client";

import { useState, type FormEvent } from "react";
import { batchCsvUrl, issueLicenses, type ContentSummary } from "@/lib/adminApi";

type IssueResult = { batchId: string; label: string; keys: string[] };

/**
 * ライセンスキー一括発行フォーム。
 * コンテンツ・ラベル（例: "M3-2026春"）・発行枚数を指定して発行し、
 * 生成キーの一覧表示とCSVダウンロードリンクを出す。
 * ── ロジックは完成済み。見た目だけ調整してください。
 */
export function IssueLicensesForm({ contents }: { contents: ContentSummary[] }) {
  const [contentId, setContentId] = useState("");
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!contentId || !label.trim() || count < 1) {
      setError("コンテンツ・ラベル・枚数を正しく入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await issueLicenses({ contentId, label: label.trim(), count });
      if (res.ok) {
        setResult({ batchId: res.batchId, label: res.label, keys: res.keys });
      } else {
        setError(`発行に失敗しました（${res.error}）。`);
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="issue-content" className="text-sm font-medium">
            コンテンツ
          </label>
          <select
            id="issue-content"
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            className="rounded border px-3 py-2"
          >
            <option value="">選択してください</option>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="issue-label" className="text-sm font-medium">
            ラベル（発行ロット名・例: M3-2026春）
          </label>
          <input
            id="issue-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="issue-count" className="text-sm font-medium">
            発行枚数（1〜1000）
          </label>
          <input
            id="issue-count"
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-32 rounded border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "発行中…" : "一括発行"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {result && (
        <div className="flex flex-col gap-2 rounded border p-3">
          <p className="text-sm">
            「{result.label}」を {result.keys.length} 件発行しました。
          </p>
          <a
            href={batchCsvUrl(result.batchId)}
            className="self-start rounded bg-black px-3 py-1.5 text-sm text-white"
          >
            CSVをダウンロード
          </a>
          <ul className="max-h-48 overflow-auto font-mono text-xs">
            {result.keys.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
