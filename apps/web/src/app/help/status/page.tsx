'use client';

// システム状態ページ
// API からリアルタイムで状態を取得し表示する

import { useEffect, useState, useCallback } from 'react';
import { getApiBaseUrl } from '../../../services/config';

// ===== 型定義 =====

type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  detail: string;
  latencyMs?: number;
  lastChecked?: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  services?: {
    api?: { status: string; latency?: number };
    database?: { status: string; latency?: number };
    blockchain?: { status: string; blockHeight?: number; syncDelay?: number };
  };
}

// ===== ステータス設定 =====

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bgColor: string; dotColor: string }> = {
  operational: {
    label: '正常稼働',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-400',
  },
  degraded: {
    label: '一部低下',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    dotColor: 'bg-amber-400',
  },
  outage: {
    label: '障害発生',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    dotColor: 'bg-red-400',
  },
  unknown: {
    label: '確認中',
    color: 'text-slate-500',
    bgColor: 'bg-slate-50',
    dotColor: 'bg-slate-300',
  },
};

// ===== ユーティリティ =====

function formatLastChecked(iso: string | undefined): string {
  if (!iso) return '未取得';
  const date = new Date(iso);
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ===== サービスカードコンポーネント =====

function ServiceCard({ service, loading }: { service: ServiceHealth; loading: boolean }) {
  const config = STATUS_CONFIG[service.status];

  if (loading) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse">
        <div className="skeleton h-4 w-24 rounded mb-3" />
        <div className="skeleton h-6 w-20 rounded-full mb-3" />
        <div className="skeleton h-12 w-full rounded" />
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* サービス名 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">{service.name}</p>
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
      </div>

      {/* ステータスバッジ */}
      <p className={`inline-flex items-center rounded-full ${config.bgColor} px-2.5 py-1 text-xs font-semibold ${config.color}`}>
        {config.label}
      </p>

      {/* 詳細説明 */}
      <p className="mt-3 text-sm text-slate-600 leading-6">{service.detail}</p>

      {/* レイテンシ情報（存在する場合） */}
      {service.latencyMs !== undefined && (
        <p className="mt-2 text-xs text-slate-400">
          応答時間: {service.latencyMs}ms
        </p>
      )}

      {/* 最終確認時刻 */}
      <p className="mt-1 text-xs text-slate-400">
        最終確認: {formatLastChecked(service.lastChecked)}
      </p>
    </article>
  );
}

// ===== ページコンポーネント =====

export default function HelpStatusPage() {
  const [services, setServices] = useState<ServiceHealth[]>([
    { name: 'API サーバー', status: 'unknown', detail: '状態を取得中...' },
    { name: 'データベース', status: 'unknown', detail: '状態を取得中...' },
    { name: 'ブロックチェーン同期', status: 'unknown', detail: '状態を取得中...' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // 状態を取得する関数
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
      const response = await fetch(`${apiBase}/v1/health`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`API エラー: ${response.status}`);
      }

      const data: HealthResponse = await response.json();
      const now = new Date().toISOString();

      // レスポンスをサービス状態に変換
      const updatedServices: ServiceHealth[] = [
        {
          name: 'API サーバー',
          status: data.services?.api?.status === 'ok' ? 'operational' : data.services?.api?.status === 'degraded' ? 'degraded' : 'unknown',
          detail: data.status === 'ok' ? '認証・店舗検索・利用権 API が正常に稼働しています。' : 'API の応答を確認中です。',
          latencyMs: data.services?.api?.latency,
          lastChecked: now,
        },
        {
          name: 'データベース',
          status: data.services?.database?.status === 'ok' ? 'operational' : data.services?.database?.status === 'degraded' ? 'degraded' : 'unknown',
          detail: data.services?.database?.status === 'ok' ? 'データベース接続が正常です。' : 'データベースの状態を確認中です。',
          latencyMs: data.services?.database?.latency,
          lastChecked: now,
        },
        {
          name: 'ブロックチェーン同期',
          status: data.services?.blockchain?.status === 'ok' ? 'operational' : data.services?.blockchain?.status === 'syncing' ? 'degraded' : 'unknown',
          detail: data.services?.blockchain?.blockHeight
            ? `Block #${data.services.blockchain.blockHeight} まで同期済み。`
            : 'Polygon ネットワークとの同期状態を確認中です。',
          lastChecked: now,
        },
      ];

      setServices(updatedServices);
      setLastRefresh(new Date());
    } catch (err) {
      // API エラー時はフォールバック状態を表示
      const now = new Date().toISOString();
      setServices([
        {
          name: 'API サーバー',
          status: 'unknown',
          detail: 'API サーバーへの接続を確認中です。',
          lastChecked: now,
        },
        {
          name: 'データベース',
          status: 'unknown',
          detail: 'データベースの状態を確認中です。',
          lastChecked: now,
        },
        {
          name: 'ブロックチェーン同期',
          status: 'unknown',
          detail: 'ブロックチェーン同期の状態を確認中です。',
          lastChecked: now,
        },
      ]);
      setError(err instanceof Error ? err.message : 'ステータスの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込みと自動更新
  useEffect(() => {
    void fetchStatus();

    // 30秒ごとに自動更新
    const interval = setInterval(() => {
      void fetchStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  // 全体のステータスを判定
  const overallStatus: ServiceStatus = services.some((s) => s.status === 'outage')
    ? 'outage'
    : services.some((s) => s.status === 'degraded')
      ? 'degraded'
      : services.every((s) => s.status === 'operational')
        ? 'operational'
        : 'unknown';

  const overallConfig = STATUS_CONFIG[overallStatus];

  return (
    <section className="container-main py-24">
      {/* ヘッダー */}
      <div className="max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">システム状態</h1>
        <p className="mt-4 text-slate-600 leading-7">
          Node Stay の各サービスの稼働状況をリアルタイムで表示しています。
        </p>
      </div>

      {/* 全体ステータスバナー */}
      <div className={`mt-8 rounded-2xl ${overallConfig.bgColor} border border-slate-200 p-5 max-w-3xl`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${overallConfig.dotColor} ${overallStatus === 'operational' ? '' : 'animate-pulse'}`} />
            <span className={`text-lg font-semibold ${overallConfig.color}`}>
              {overallStatus === 'operational'
                ? '全サービス正常稼働中'
                : overallStatus === 'degraded'
                  ? '一部サービスに影響あり'
                  : overallStatus === 'outage'
                    ? '障害が発生しています'
                    : '状態を確認中'}
            </span>
          </div>
          <button
            onClick={() => void fetchStatus()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {loading ? '更新中...' : '更新'}
          </button>
        </div>
        {lastRefresh && (
          <p className="mt-2 text-xs text-slate-500">
            最終更新: {lastRefresh.toLocaleTimeString('ja-JP')}（30秒ごとに自動更新）
          </p>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 max-w-3xl">
          <p className="text-sm text-amber-700">
            <span className="font-semibold">注意: </span>
            {error}
          </p>
        </div>
      )}

      {/* サービス一覧 */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.name} service={service} loading={loading && !lastRefresh} />
        ))}
      </div>

      {/* お問い合わせ案内 */}
      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 max-w-3xl">
        <h2 className="text-base font-semibold text-slate-800 mb-2">障害報告・お問い合わせ</h2>
        <p className="text-sm text-slate-600 leading-6">
          サービスに問題が発生している場合、または上記のステータスと異なる挙動が見られる場合は、
          <a href="mailto:support@nodestay.io" className="text-brand-600 hover:text-brand-800 font-medium mx-1">
            support@nodestay.io
          </a>
          までご連絡ください。
        </p>
      </div>
    </section>
  );
}
