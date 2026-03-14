'use client';

// ログインを促すバナーコンポーネント
// ミドルウェアからリダイレクトされた場合（?redirect= パラメータ付き）に表示

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export function LoginPromptBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    const redirect = searchParams.get('redirect');
    if (redirect) {
      setRedirectPath(redirect);
      setVisible(true);
    }
  }, [searchParams]);

  // バナーを閉じる際にURLからredirectパラメータを削除
  const handleDismiss = () => {
    setVisible(false);
    // URLからredirectパラメータを削除
    const url = new URL(window.location.href);
    url.searchParams.delete('redirect');
    router.replace(url.pathname + url.search, { scroll: false });
  };

  if (!visible) return null;

  // リダイレクト先の日本語ラベルを取得
  const getPathLabel = (path: string): string => {
    const labels: Record<string, string> = {
      '/usage-rights': '利用権管理',
      '/sessions': 'セッション',
      '/revenue': '収益ダッシュボード',
      '/merchant': '加盟店管理',
      '/merchant/dashboard': '加盟店ダッシュボード',
      '/passes': 'マイ利用権',
    };
    // パスの先頭部分でマッチング
    for (const [key, label] of Object.entries(labels)) {
      if (path.startsWith(key)) return label;
    }
    return 'このページ';
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 animate-slide-down">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-lg flex items-start gap-3">
        {/* アイコン */}
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="#D97706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* メッセージ */}
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">ログインが必要です</p>
          <p className="text-xs text-amber-700 mt-0.5">
            「{redirectPath ? getPathLabel(redirectPath) : 'このページ'}」にアクセスするには、先にログインしてください。
          </p>
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={handleDismiss}
          className="w-6 h-6 rounded-lg hover:bg-amber-100 flex items-center justify-center text-amber-500 transition-colors flex-shrink-0"
          aria-label="閉じる"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
