'use client';

/**
 * グローバルアラートコンポーネント
 * 環境設定診断とチェーン同期エラーをバナー形式で表示
 */

import { useEffect, useState } from 'react';
import { useChainSyncStore } from '../../models/stores/chainSync.store';
import { getConfigDiagnostics } from '../../services/config';

export function GlobalAlerts() {
  const chainSyncLastError = useChainSyncStore((s) => s.lastError);
  const clearChainSyncError = useChainSyncStore((s) => s.clearError);
  const [configDiagnostics, setConfigDiagnostics] = useState<ReturnType<typeof getConfigDiagnostics> | null>(null);
  const [dismissedConfig, setDismissedConfig] = useState(false);
  const [dismissedSync, setDismissedSync] = useState(false);

  useEffect(() => {
    setConfigDiagnostics(getConfigDiagnostics());
  }, []);

  const showConfigBanner = configDiagnostics && !configDiagnostics.ok && !dismissedConfig;
  const showSyncBanner = chainSyncLastError && !dismissedSync;

  if (!showConfigBanner && !showSyncBanner) return null;

  return (
    <div className="sticky top-16 z-40 space-y-0">
      {showConfigBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start justify-between gap-3 container-main">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 mb-1">環境設定の確認</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {configDiagnostics.errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setDismissedConfig(true)}
            className="shrink-0 text-amber-600 hover:text-amber-800 p-1 rounded"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      )}
      {showSyncBanner && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between gap-3 container-main">
          <p className="text-sm text-rose-800 flex-1 min-w-0 truncate" title={chainSyncLastError ?? undefined}>
            チェーン同期エラー: {chainSyncLastError}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearChainSyncError();
                setDismissedSync(true);
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
