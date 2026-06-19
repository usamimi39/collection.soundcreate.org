"use client";

import { useCallback, useEffect, useState } from "react";
import { listContents, type ContentSummary } from "@/lib/adminApi";
import { CreateContentForm } from "@/components/admin/CreateContentForm";
import { IssueLicensesForm } from "@/components/admin/IssueLicensesForm";

/**
 * 管理ダッシュボード（コンテンツ作成 ＋ ライセンスキー一括発行）。
 * ※ 保護は Cloudflare Access で行う前提（アプリ側に認証はない）。
 *   デプロイ前に /admin・/api/admin/* を必ず Access で遮断すること。
 * ── データ取得・状態管理は完成済み。見た目だけ調整してください。
 */
export default function AdminPage() {
  const [contents, setContents] = useState<ContentSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      setContents(await listContents());
    } catch {
      setContents([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">管理ダッシュボード</h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">コンテンツを作成</h2>
        <CreateContentForm onCreated={refresh} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">ライセンスキーを一括発行</h2>
        <IssueLicensesForm contents={contents} />
      </section>
    </main>
  );
}
