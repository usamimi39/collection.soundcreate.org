"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLibrary } from "@/lib/api";
import { LicenseKeyForm } from "@/components/LicenseKeyForm";
import { Bookshelf, type BookshelfItem } from "@/components/Bookshelf";

/**
 * ユーザー用トップページ（ライセンスキー入力 ＋ 本棚）。
 * ── データ取得・状態管理のロジックは完成済み。
 *    レイアウトや見た目の className だけ自由に調整してください。
 */
export default function Home() {
  const [items, setItems] = useState<BookshelfItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 本棚を取得（device_token Cookie に紐付く所有コンテンツ）。
  // 初期ローディングは useState(true) が担うため、ここでは await 後にのみ
  // setState する（エフェクト内の同期 setState を避ける）。
  const refresh = useCallback(async () => {
    try {
      setItems(await fetchLibrary());
    } catch {
      // 取得失敗時は空のまま（必要ならトースト等をここに）
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回マウント時に本棚を読み込む。
  // refresh は await 後にのみ setState する非同期処理のため、
  // クライアントでのマウント時フェッチとして意図的に許可する。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">My Collection</h1>
        <p className="text-sm text-zinc-500">
          お持ちのCDのライセンスキーを入力すると、本棚に追加されます。
        </p>
      </header>

      <section>
        {/* キー検証に成功したら refresh で本棚を更新 */}
        <LicenseKeyForm onVerified={refresh} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">本棚</h2>
        <Bookshelf items={items} loading={loading} />
      </section>
    </main>
  );
}
