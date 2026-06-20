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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-10 bg-white px-6 py-12 text-center">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">SoundCreate Collection</h1>
        <p className="text-sm text-zinc-500">
          お持ちのCDのライセンスキーを入力すると、コレクションに追加されます。
        </p>
      </header>

      <section className="w-full max-w-sm">
        {/* キー検証に成功したら refresh で本棚を更新 */}
        <LicenseKeyForm onVerified={refresh} />
      </section>

      <section className="flex w-full flex-col items-center gap-4">
        <h2 className="text-lg font-medium">Collection</h2>
        <Bookshelf items={items} loading={loading} />
      </section>
    </main>
  );
}
