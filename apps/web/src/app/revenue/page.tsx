'use client';

// 収益権ダッシュボードページ（View 層：useRevenueDashboard の戻り値を表示のみ）

import Link from 'next/link';
import { useRevenueDashboard } from '../../hooks/useRevenueDashboard';
import type { RevenueRight, Allocation } from '../../hooks/useRevenueDashboard';

// -----------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------

/** JPYC minor（1/100 単位）を "1,234.56 JPYC" 形式に変換 */
function formatJpyc(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** ISO 日時を "2026年4月1日" 形式に変換 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 配当サイクルの日本語ラベル */
const CYCLE_LABEL: Record<string, string> = {
  DAILY: '日次',
  WEEKLY: '週次',
  MONTHLY: '月次',
};

// -----------------------------------------------------------------------
// KPI カード
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// 収益権カード（プログラム単位）
// -----------------------------------------------------------------------

function RevenueRightCard({ right }: { right: RevenueRight }) {
  const prog = right.program;
  const isActive = right.status === 'ACTIVE';

  return (
    <div className={`card p-5 flex flex-col gap-4 ${!isActive ? 'opacity-60' : ''}`}>
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActive ? 'bg-emerald-400' : 'bg-slate-300'
              }`}
            />
            <h3 className="text-sm font-bold text-slate-900 truncate">{prog.machineName}</h3>
          </div>
          <p className="text-xs text-slate-500 truncate">{prog.venueName}</p>
        </div>
        <span className={isActive ? 'badge-green' : 'badge-gray'}>
          {isActive ? '稼働中' : '終了'}
        </span>
      </div>

      {/* 保有割合ゲージ */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>保有割合</span>
          <span className="font-bold text-brand-600">{right.sharePercent}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full"
            style={{ width: `${Math.min(100, right.sharePercent)}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {right.holdAmount.toLocaleString()} / {right.totalSupply.toLocaleString()} トークン
        </p>
      </div>

      {/* 詳細グリッド */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-400">配当サイクル</dt>
          <dd className="font-semibold text-slate-700">{CYCLE_LABEL[prog.settlementCycle] ?? prog.settlementCycle}</dd>
        </div>
        <div>
          <dt className="text-slate-400">nodeId</dt>
          <dd className="font-mono text-slate-700 truncate">{prog.nodeId.slice(0, 10)}…</dd>
        </div>
        <div>
          <dt className="text-slate-400">開始日</dt>
          <dd className="font-semibold text-slate-700">{formatDate(prog.startAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">終了日</dt>
          <dd className="font-semibold text-slate-700">{formatDate(prog.endAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

// -----------------------------------------------------------------------
// 配当行（テーブル行）
// -----------------------------------------------------------------------

function AllocationRow({
  alloc,
  claimingId,
  claimSuccess,
  onClaim,
}: {
  alloc: Allocation;
  claimingId: string | null;
  claimSuccess: string | null;
  onClaim: (id: string) => void;
}) {
  const isClaiming = claimingId === alloc.allocationId;
  const isSuccess = claimSuccess === alloc.allocationId;
  const canClaim = !alloc.claimed && !isClaiming;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      {/* プログラム名 */}
      <td className="py-3 px-4 text-sm text-slate-700 font-medium">{alloc.programName}</td>

      {/* 対象期間 */}
      <td className="py-3 px-4 text-sm text-slate-500">{alloc.periodLabel}</td>

      {/* 総配当額 */}
      <td className="py-3 px-4 text-sm text-right text-slate-500">
        {formatJpyc(alloc.totalAmountMinor)} JPYC
      </td>

      {/* 自分の取り分 */}
      <td className="py-3 px-4 text-sm text-right font-bold text-slate-900">
        {formatJpyc(alloc.myAmountMinor)} JPYC
      </td>

      {/* クレーム期限 */}
      <td className="py-3 px-4 text-xs text-slate-400 text-right">
        {formatDate(alloc.claimableUntil)}まで
      </td>

      {/* アクション */}
      <td className="py-3 px-4 text-right">
        {isSuccess ? (
          <span className="badge-green text-xs">受取完了</span>
        ) : alloc.claimed ? (
          <span className="badge-gray text-xs">受取済み</span>
        ) : (
          <button
            onClick={() => canClaim && onClaim(alloc.allocationId)}
            disabled={!canClaim}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
              isClaiming
                ? 'bg-slate-100 text-slate-400 cursor-wait'
                : 'bg-jpyc-500 hover:bg-jpyc-600 text-white shadow-sm'
            }`}
          >
            {isClaiming ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                処理中
              </span>
            ) : (
              '受け取る'
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------
// ページ
// -----------------------------------------------------------------------

export default function RevenueDashboardPage() {
  const {
    rights,
    allocations,
    unclaimedTotalMinor,
    claimedTotalMinor,
    loading,
    claimingId,
    claimSuccess,
    handleClaim,
  } = useRevenueDashboard();

  const unclaimedCount = allocations.filter((a) => !a.claimed).length;

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">収益権ダッシュボード</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">収益権ダッシュボード</h1>
              <p className="text-slate-400">
                保有している ERC-1155 収益権の配当を管理します
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <p className="text-xs text-slate-400">
                この画面は投資家向け（保有・配当受取）です
              </p>
              <Link
                href="/merchant/dashboard"
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
              >
                収益権プログラム発行（店舗向け）
              </Link>
            </div>
            {unclaimedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jpyc-500/10 border border-jpyc-500/30">
                <span className="w-2 h-2 rounded-full bg-jpyc-400 animate-pulse" />
                <span className="text-jpyc-400 text-sm font-semibold">
                  {unclaimedCount}件の未受取配当があります
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8 space-y-10">

        {/* KPI カード */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="未受取合計"
            value={formatJpyc(unclaimedTotalMinor)}
            unit="JPYC"
            accent
          />
          <KpiCard
            label="累計受取済み"
            value={formatJpyc(claimedTotalMinor)}
            unit="JPYC"
          />
          <KpiCard
            label="保有収益権数"
            value={rights.length.toString()}
            unit="プログラム"
          />
        </div>

        {/* 収益権プログラム一覧 */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-4">保有収益権</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="card p-5 h-48 animate-pulse bg-slate-100" />
              ))}
            </div>
          ) : rights.length === 0 ? (
            <div className="text-center py-14 card">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-slate-600 font-semibold">収益権を保有していません</p>
              <p className="text-slate-400 text-sm mt-1">マシン収益プログラムに投資すると収益権が発行されます</p>
              <p className="text-slate-400 text-xs mt-2">
                発行・配布は商戶側ワークフロー（または運営バッチ）で実行されます
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rights.map((right) => (
                <RevenueRightCard key={right.id} right={right} />
              ))}
            </div>
          )}
        </section>

        {/* 配当履歴・クレームテーブル */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">配当履歴</h2>
            <span className="text-xs text-slate-400">
              全 {allocations.length} 件
            </span>
          </div>

          {/* クレーム成功バナー */}
          {claimSuccess && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              JPYC の受け取りが完了しました
            </div>
          )}

          {loading ? (
            <div className="card p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-14 card">
              <p className="text-4xl mb-3">🗂️</p>
              <p className="text-slate-600 font-semibold">配当履歴がありません</p>
              <p className="text-slate-400 text-sm mt-1">配当サイクル完了後に自動的に記録されます</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">プログラム</th>
                      <th className="py-2.5 px-4 text-left text-xs font-semibold text-slate-500">対象期間</th>
                      <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-500">総配当</th>
                      <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-500">自分の取り分</th>
                      <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-500">受取期限</th>
                      <th className="py-2.5 px-4 text-right text-xs font-semibold text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((alloc) => (
                      <AllocationRow
                        key={alloc.allocationId}
                        alloc={alloc}
                        claimingId={claimingId}
                        claimSuccess={claimSuccess}
                        onClaim={handleClaim}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* オンチェーン情報フッター */}
        <section className="card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">オンチェーン情報</h3>
            <p className="text-xs text-slate-500">
              収益権は ERC-1155 トークンとして Polygon PoS 上に記録されています。
              Claim はスマートコントラクト経由で JPYC を直接受け取ります。
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
        </section>
      </div>
    </>
  );
}
