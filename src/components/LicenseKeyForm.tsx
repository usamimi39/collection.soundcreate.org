"use client";

import { useState, type FormEvent } from "react";
import { verifyLicense } from "@/lib/api";
import { isValidLicenseKey, normalizeLicenseKey } from "@/lib/keys";

// APIのエラー種別 → ユーザー向け文言。スタイリングと併せて自由に文言調整可。
const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "入力内容が正しくありません。",
  invalid_format: "キーの形式が正しくありません（例: A1B2-C3D4）。",
  not_found: "このライセンスキーは見つかりませんでした。",
  device_limit_reached:
    "このキーは登録できるデバイス数の上限に達しています。",
  rate_limited: "試行回数が多すぎます。しばらくしてから再度お試しください。",
};

type Feedback = { type: "error" | "success"; text: string };

/**
 * ライセンスキー入力フォーム。
 * 検証成功時に onVerified() を呼び、親に本棚の再取得を促す。
 * ── ロジックは完成済み。className 等の見た目だけ調整してください。
 */
export function LicenseKeyForm({ onVerified }: { onVerified: () => void }) {
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeLicenseKey(key);

    // 送信前のクライアント側バリデーション（サーバ側でも再検証される）
    if (!isValidLicenseKey(normalized)) {
      setFeedback({ type: "error", text: ERROR_MESSAGES.invalid_format });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await verifyLicense(normalized);
      if (result.ok) {
        setFeedback({
          type: "success",
          text: `「${result.content.title}」を本棚に追加しました。`,
        });
        setKey("");
        onVerified();
      } else {
        setFeedback({
          type: "error",
          text: ERROR_MESSAGES[result.error] ?? "エラーが発生しました。",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "通信エラーが発生しました。時間をおいて再度お試しください。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3">
      <label htmlFor="license-key" className="text-sm font-medium">
        ライセンスキー
      </label>
      <div className="flex w-full gap-2">
        <input
          id="license-key"
          name="license-key"
          value={key}
          // 英大文字+数字のみ・大文字化。最大9文字（A1B2-C3D4）。
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="A1B2-C3D4"
          maxLength={9}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-center font-mono tracking-widest outline-none focus:border-[#66ccff]"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-[#66ccff] px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "確認中…" : "登録"}
        </button>
      </div>
      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={
            feedback.type === "error" ? "text-sm text-red-600" : "text-sm text-green-600"
          }
        >
          {feedback.text}
        </p>
      )}
    </form>
  );
}
