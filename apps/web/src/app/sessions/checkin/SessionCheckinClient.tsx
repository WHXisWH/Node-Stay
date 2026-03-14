'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NodeStayApiError } from '@nodestay/api-client';
import { createNodeStayClient } from '../../../services/nodestay';
import { useUserStore } from '../../../stores/user.store';

function parseCheckinError(error: unknown): string {
  if (error instanceof NodeStayApiError) {
    if (error.bodyJson && typeof error.bodyJson === 'object') {
      const message = (error.bodyJson as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return `チェックインに失敗しました（${error.status}）`;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'チェックインに失敗しました。時間をおいて再試行してください。';
}

export function SessionCheckinClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setActiveSessionId = useUserStore((s) => s.setActiveSessionId);

  const usageRightId = useMemo(() => (searchParams.get('usageRightId') ?? '').trim(), [searchParams]);
  const venueId = useMemo(() => (searchParams.get('venueId') ?? '').trim(), [searchParams]);

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCheckin = usageRightId.length > 0 && venueId.length > 0;

  const handleCheckin = async () => {
    if (!canCheckin) return;
    setChecking(true);
    setError(null);
    try {
      const client = createNodeStayClient();
      const result = await client.checkinSession({ usageRightId, venueId });
      setActiveSessionId(result.sessionId);
      router.replace('/sessions');
    } catch (e) {
      setError(parseCheckinError(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/sessions" className="hover:text-slate-300 transition-colors">セッション</Link>
            <span>/</span>
            <span className="text-slate-300">QRチェックイン</span>
          </nav>
          <h1 className="text-3xl font-extrabold text-white mb-2">QRチェックイン確認</h1>
          <p className="text-slate-400">内容を確認してチェックインを実行してください。</p>
        </div>
      </div>

      <div className="container-main py-10">
        <div className="max-w-xl mx-auto card p-6 space-y-5">
          {!canCheckin ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              QR データが不正です。マイ利用権ページから QR を再表示してください。
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                <p className="text-xs text-slate-500">利用権ID</p>
                <p className="font-mono text-xs text-slate-800 break-all">{usageRightId}</p>
                <p className="text-xs text-slate-500 mt-3">店舗ID</p>
                <p className="font-mono text-xs text-slate-800 break-all">{venueId}</p>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={() => void handleCheckin()}
                disabled={checking}
                className="btn-primary w-full py-3 text-base disabled:opacity-50"
              >
                {checking ? 'チェックイン中...' : 'チェックインを実行する'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
