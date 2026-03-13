'use client';

// 決済履歴・精算レポートページ（店舗オペレーター向け）

import Link from 'next/link';
import { useState } from 'react';

// ===== 型定義 =====

interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalRevenueMinor: number;
  platformFeeMinor: number;
  netPayoutMinor: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  txHash?: string;
  completedAt?: string;
}

// ===== モックデータ（実装時はAPIから取得） =====

const MOCK_SETTLEMENTS: Settlement[] = [
  {
    id: 'stl_001',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-07',
    totalRevenueMinor: 1250000,
    platformFeeMinor: 312500,
    netPayoutMinor: 937500,
    status: 'COMPLETED',
    txHash: '0x1234...abcd',
    completedAt: '2026-03-08T10:30:00Z',
  },
  {
    id: 'stl_002',
    periodStart: '2026-03-08',
    periodEnd: '2026-03-14',
    totalRevenueMinor: 980000,
    platformFeeMinor: 245000,
    netPayoutMinor: 735000,
    status: 'PROCESSING',
  },
  {
    id: 'stl_003',
    periodStart: '2026-02-22',
    periodEnd: '2026-02-28',
    totalRevenueMinor: 1100000,
    platformFeeMinor: 275000,
    netPayoutMinor: 825000,
    status: 'COMPLETED',
    txHash: '0x5678...efgh',
    completedAt: '2026-03-01T09:15:00Z',
  },
];

// ===== ユーティリティ =====

/** JPYC minor を表示用にフォーマット */
function formatJPYC(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** 日付をフォーマット */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ===== ステータス設定 =====

const STATUS_CONFIG: Record<Settlement['status'], { label: string; badge: string }> = {
  PENDING: { label: '処理待ち', badge: 'badge-yellow' },
  PROCESSING: { label: '処理中', badge: 'bg-blue-100 text-blue-700 badge' },
  COMPLETED: { label: '完了', badge: 'badge-green' },
  FAILED: { label: '失敗', badge: 'badge-red' },
};

// ===== 決済行コンポーネント =====

function SettlementRow({ settlement }: { settlement: Settlement }) {
  const statusCfg = STATUS_CONFIG[settlement.status];

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      {/* 期間 */}
      <td className="py-4 px-4">
        <div className="text-sm font-medium text-slate-800">
          {formatDate(settlement.periodStart)} 〜 {formatDate(settlement.periodEnd)}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">ID: {settlement.id}</div>
      </td>

      {/* 総収益 */}
      <td className="py-4 px-4 text-right">
        <div className="text-sm font-semibold text-slate-800">
          {formatJPYC(settlement.totalRevenueMinor)} JPYC
        </div>
      </td>

      {/* プラットフォーム手数料 */}
      <td className="py-4 px-4 text-right">
        <div className="text-sm text-slate-500">
          -{formatJPYC(settlement.platformFeeMinor)} JPYC
        </div>
        <div className="text-xs text-slate-400">25%</div>
      </td>

      {/* 純支払額 */}
      <td className="py-4 px-4 text-right">
        <div className="text-sm font-bold text-jpyc-600">
          {formatJPYC(settlement.netPayoutMinor)} JPYC
        </div>
      </td>

      {/* ステータス */}
      <td className="py-4 px-4 text-right">
        <span className={statusCfg.badge}>{statusCfg.label}</span>
        {settlement.completedAt && (
          <div className="text-xs text-slate-400 mt-1">
            {formatDate(settlement.completedAt)}
          </div>
        )}
      </td>

      {/* トランザクション */}
      <td className="py-4 px-4 text-right">
        {settlement.txHash ? (
          <a
            href={`https://polygonscan.com/tx/${settlement.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-600 hover:text-brand-800 font-mono"
          >
            {settlement.txHash.slice(0, 10)}...
          </a>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
}

// ===== KPIカード =====

function KpiCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 flex flex-col gap-1 ${accent ? 'border border-jpyc-400/40' : ''}`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={`text-2xl font-extrabold ${
            accent ? 'text-jpyc-500' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====

export default function MerchantSettlementsPage() {
  const [settlements] = useState<Settlement[]>(MOCK_SETTLEMENTS);

  // KPI計算
  const totalPaidOut = settlements
    .filter((s) => s.status === 'COMPLETED')
    .reduce((sum, s) => sum + s.netPayoutMinor, 0);
  const pendingPayout = settlements
    .filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING')
    .reduce((sum, s) => sum + s.netPayoutMinor, 0);
  const completedCount = settlements.filter((s) => s.status === 'COMPLETED').length;

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">
              ホーム
            </Link>
            <span>/</span>
            <Link href="/merchant/dashboard" className="hover:text-slate-300 transition-colors">
              加盟店管理
            </Link>
            <span>/</span>
            <span className="text-slate-300">精算レポート</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">精算レポート</h1>
              <p className="text-slate-400">
                週次の売上集計と JPYC による精算履歴を確認できます
              </p>
            </div>
            <Link
              href="/merchant/dashboard"
              className="btn-secondary py-2 px-4 text-sm"
            >
              ダッシュボードへ戻る
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8 space-y-8">
        {/* KPIカード */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="累計精算額"
            value={formatJPYC(totalPaidOut)}
            unit="JPYC"
            accent
          />
          <KpiCard
            label="処理中の精算"
            value={formatJPYC(pendingPayout)}
            unit="JPYC"
          />
          <KpiCard label="完了済み精算" value={completedCount.toString()} unit="件" />
        </div>

        {/* 精算履歴テーブル */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">精算履歴</h2>
            <span className="text-xs text-slate-400">全 {settlements.length} 件</span>
          </div>

          {settlements.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-5xl mb-4">📊</div>
              <p className="text-slate-600 font-semibold">精算履歴がありません</p>
              <p className="text-slate-400 text-sm mt-1">
                週次の売上集計後に自動的に記録されます
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500">
                      対象期間
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500">
                      総収益
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500">
                      手数料
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500">
                      純支払額
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500">
                      ステータス
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500">
                      トランザクション
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => (
                    <SettlementRow key={settlement.id} settlement={settlement} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 精算ルール説明 */}
        <div className="card p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4">精算ルール</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📅</span>
                <span className="font-semibold text-slate-800">精算サイクル</span>
              </div>
              <p className="text-sm text-slate-600">
                毎週月曜日に前週分（月〜日）の売上を集計し、精算処理を開始します。
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">💰</span>
                <span className="font-semibold text-slate-800">手数料</span>
              </div>
              <p className="text-sm text-slate-600">
                プラットフォーム手数料として総収益の25%を差し引いた金額が支払われます。
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">⛓️</span>
                <span className="font-semibold text-slate-800">支払い方法</span>
              </div>
              <p className="text-sm text-slate-600">
                JPYC（Polygon PoS）で登録済みの Treasury Wallet に直接送金されます。
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🔍</span>
                <span className="font-semibold text-slate-800">トランザクション確認</span>
              </div>
              <p className="text-sm text-slate-600">
                完了した精算はPolygonScanでトランザクション詳細を確認できます。
              </p>
            </div>
          </div>
        </div>

        {/* オンチェーン情報フッター */}
        <div className="card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">お問い合わせ</h3>
            <p className="text-xs text-slate-500">
              精算に関するご質問は support@nodestay.io までご連絡ください。
            </p>
          </div>
          <a
            href="https://polygonscan.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary py-2 px-4 text-sm whitespace-nowrap"
          >
            PolygonScan で確認
          </a>
        </div>
      </div>
    </>
  );
}
