'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRevenueDashboard } from '../../hooks/useRevenueDashboard';
import { useRevenueMarket, type RevenueMarketListing } from '../../hooks/useRevenueMarket';
import type { RevenueRight, Allocation } from '../../hooks/useRevenueDashboard';
import { useUserState } from '../../hooks/useUserState';

/** JPYC minor（1/100 単位）を "1,234.56" 形式に変換 */
function formatJpyc(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 文字列 minor を安全に "1,234.56" 形式に変換 */
function formatJpycString(minorText: string): string {
  const value = Number(minorText);
  if (!Number.isFinite(value)) return minorText;
  return (value / 100).toLocaleString('ja-JP', {
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

/** ISO 日時を "YYYY/MM/DD HH:mm" 形式に変換 */
function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CYCLE_LABEL: Record<string, string> = {
  DAILY: '日次',
  WEEKLY: '週次',
  MONTHLY: '月次',
};

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
        <span className={`text-2xl font-extrabold ${accent ? 'text-jpyc-500' : 'text-slate-900'}`}>
          {value}
        </span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function RevenueRightCard({ right }: { right: RevenueRight }) {
  const prog = right.program;
  const isActive = right.status === 'ACTIVE';

  return (
    <div className={`card p-5 flex flex-col gap-4 ${!isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            <h3 className="text-sm font-bold text-slate-900 truncate">{prog.machineName}</h3>
          </div>
          <p className="text-xs text-slate-500 truncate">{prog.venueName}</p>
        </div>
        <span className={isActive ? 'badge-green' : 'badge-gray'}>{isActive ? '稼働中' : '終了'}</span>
      </div>

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
      <td className="py-3 px-4 text-sm text-slate-700 font-medium">{alloc.programName}</td>
      <td className="py-3 px-4 text-sm text-slate-500">{alloc.periodLabel}</td>
      <td className="py-3 px-4 text-sm text-right text-slate-500">{formatJpyc(alloc.totalAmountMinor)} JPYC</td>
      <td className="py-3 px-4 text-sm text-right font-bold text-slate-900">{formatJpyc(alloc.myAmountMinor)} JPYC</td>
      <td className="py-3 px-4 text-xs text-slate-400 text-right">{formatDate(alloc.claimableUntil)}まで</td>
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

function MarketListingCard({
  listing,
  myWalletAddress,
  pending,
  onBuy,
}: {
  listing: RevenueMarketListing;
  myWalletAddress: string | null;
  pending: boolean;
  onBuy: (listingId: string) => void;
}) {
  const isMine =
    !!myWalletAddress &&
    !!listing.sellerWalletAddress &&
    myWalletAddress.toLowerCase() === listing.sellerWalletAddress.toLowerCase();

  return (
    <div className="card p-5 flex flex-col gap-4 border border-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{listing.revenueRight.machineName}</h3>
          <p className="text-xs text-slate-500">{listing.revenueRight.venueName}</p>
        </div>
        <span className="badge-green">出品中</span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-400">プログラムID</dt>
          <dd className="font-mono text-slate-700">#{listing.revenueRight.onchainProgramId ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">数量</dt>
          <dd className="font-semibold text-slate-700">{listing.revenueRight.amount1155 ?? '-'} トークン</dd>
        </div>
        <div>
          <dt className="text-slate-400">価格</dt>
          <dd className="font-bold text-jpyc-600">{formatJpycString(listing.priceJpyc)} JPYC</dd>
        </div>
        <div>
          <dt className="text-slate-400">期限</dt>
          <dd className="font-semibold text-slate-700">{formatDateTime(listing.expiryAt)}</dd>
        </div>
      </dl>

      <button
        className="btn-primary py-2.5 text-sm disabled:opacity-50"
        disabled={pending || isMine}
        onClick={() => onBuy(listing.id)}
      >
        {isMine ? '自分の出品です' : pending ? '処理中...' : '購入する'}
      </button>
    </div>
  );
}

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
    refresh,
  } = useRevenueDashboard();

  const { onchainWalletAddress } = useUserState();
  const market = useRevenueMarket({ rights, refreshDashboard: refresh });

  const [newListingRightId, setNewListingRightId] = useState('');
  const [newListingPrice, setNewListingPrice] = useState('');
  const [newListingExpiryDays, setNewListingExpiryDays] = useState('7');

  const unclaimedCount = allocations.filter((a) => !a.claimed).length;

  const listableRights = useMemo(
    () => rights.filter((r) => r.status === 'ACTIVE' && !!r.onchainProgramId && r.holdAmount > 0),
    [rights],
  );

  useEffect(() => {
    if (!newListingRightId && listableRights.length > 0) {
      setNewListingRightId(listableRights[0].id);
    }
  }, [listableRights, newListingRightId]);

  const handleCreateListing = async () => {
    const days = Number(newListingExpiryDays);
    const expiryAt = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    await market.createListing({
      revenueRightId: newListingRightId,
      priceJpyc: newListingPrice,
      expiryAtIso: expiryAt,
    });
  };

  const myRows = market.myListings;

  return (
    <>
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">収益権ダッシュボード</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">収益権ダッシュボード</h1>
              <p className="text-slate-400">保有・配当受取・市場売買を 1 画面で管理します</p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <p className="text-xs text-slate-400">投資家向け機能（保有 / 配当 / 二次流通）</p>
              <Link
                href="/merchant"
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
              >
                収益権プログラム発行（店舗向け）
              </Link>
            </div>
            {unclaimedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jpyc-500/10 border border-jpyc-500/30">
                <span className="w-2 h-2 rounded-full bg-jpyc-400 animate-pulse" />
                <span className="text-jpyc-400 text-sm font-semibold">{unclaimedCount}件の未受取配当があります</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container-main py-8 space-y-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="未受取合計" value={formatJpyc(unclaimedTotalMinor)} unit="JPYC" accent />
          <KpiCard label="累計受取済み" value={formatJpyc(claimedTotalMinor)} unit="JPYC" />
          <KpiCard label="保有収益権数" value={rights.length.toString()} unit="プログラム" />
        </div>

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
              <p className="text-slate-600 font-semibold">収益権を保有していません</p>
              <p className="text-slate-400 text-sm mt-1">収益プログラムに参加すると収益権が配布されます</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rights.map((right) => (
                <RevenueRightCard key={right.id} right={right} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">収益権市場</h2>
            <button className="btn-secondary py-2 px-4 text-sm" onClick={() => void market.reload()}>
              市場を再読込
            </button>
          </div>

          {market.success && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">{market.success.message}</p>
              {market.success.txHashes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {market.success.txHashes.map((txHash, idx) => (
                    <a
                      key={`${txHash}-${idx}`}
                      href={market.explorerTxUrl(txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-700 underline underline-offset-2"
                    >
                      取引詳細を確認する（{idx + 1}）
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {(market.loadingError || market.actionError) && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {market.loadingError ?? market.actionError}
            </div>
          )}

          {!market.config?.chainEnabled && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              現在、オンチェーン接続が無効のため市場取引は実行できません。
            </div>
          )}

          <div className="card p-5 mb-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">新規出品</h3>
            <p className="text-xs text-slate-500">
              出品時に収益権をエスクローへ移転します。購入成立後に買い手へ自動受渡されます。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs text-slate-600">
                出品対象
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newListingRightId}
                  onChange={(e) => setNewListingRightId(e.target.value)}
                >
                  {listableRights.length === 0 && <option value="">出品可能な収益権がありません</option>}
                  {listableRights.map((right) => (
                    <option key={right.id} value={right.id}>
                      {right.program.machineName} / {right.holdAmount} トークン
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-slate-600">
                価格（JPYC minor）
                <input
                  type="text"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newListingPrice}
                  onChange={(e) => setNewListingPrice(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="例: 3500"
                />
              </label>

              <label className="text-xs text-slate-600">
                期限
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newListingExpiryDays}
                  onChange={(e) => setNewListingExpiryDays(e.target.value)}
                >
                  <option value="1">1日</option>
                  <option value="3">3日</option>
                  <option value="7">7日</option>
                  <option value="14">14日</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">1 JPYC = 100 minor。整数のみ入力できます。</p>
              <button
                className="btn-primary py-2 px-5 text-sm disabled:opacity-50"
                disabled={
                  market.actionPending ||
                  !newListingRightId ||
                  !newListingPrice ||
                  listableRights.length === 0
                }
                onClick={() => void handleCreateListing()}
              >
                {market.actionPending ? '出品処理中...' : '出品する'}
              </button>
            </div>
          </div>

          {market.loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="card h-52 animate-pulse bg-slate-100" />
              ))}
            </div>
          ) : market.publicListings.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">現在、出品中の収益権はありません</p>
              <p className="mt-1 text-xs text-slate-500">最初の出品を作成するとここに表示されます</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {market.publicListings.map((listing) => (
                <MarketListingCard
                  key={listing.id}
                  listing={listing}
                  myWalletAddress={onchainWalletAddress}
                  pending={market.actionPending}
                  onBuy={(listingId) => void market.buyListing(listingId)}
                />
              ))}
            </div>
          )}

          <div className="card mt-5 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">自分の市場履歴</h3>
              <span className="text-xs text-slate-400">{myRows.length} 件</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-2.5">マシン</th>
                    <th className="px-4 py-2.5">数量</th>
                    <th className="px-4 py-2.5">価格</th>
                    <th className="px-4 py-2.5">状態</th>
                    <th className="px-4 py-2.5">更新時刻</th>
                    <th className="px-4 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {myRows.map((row) => {
                    const canCancel =
                      row.status === 'ACTIVE' &&
                      !!onchainWalletAddress &&
                      !!row.sellerWalletAddress &&
                      onchainWalletAddress.toLowerCase() === row.sellerWalletAddress.toLowerCase();

                    const canSettle =
                      row.status === 'SETTLING' &&
                      !!onchainWalletAddress &&
                      !!row.buyerWalletAddress &&
                      onchainWalletAddress.toLowerCase() === row.buyerWalletAddress.toLowerCase();

                    return (
                      <tr key={row.id} className="border-t border-slate-100 text-sm">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{row.revenueRight.machineName}</p>
                          <p className="text-xs text-slate-500">{row.revenueRight.venueName}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.revenueRight.amount1155 ?? '-'} トークン</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{formatJpycString(row.priceJpyc)} JPYC</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              row.status === 'ACTIVE'
                                ? 'badge-green'
                                : row.status === 'SETTLING'
                                  ? 'badge-yellow'
                                  : 'badge-gray'
                            }
                          >
                            {row.status === 'ACTIVE' ? '出品中' : row.status === 'SETTLING' ? '受渡待ち' : '終了'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(row.soldAt ?? row.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {canCancel ? (
                            <button
                              className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-50"
                              disabled={market.actionPending}
                              onClick={() => void market.cancelListing(row.id)}
                            >
                              取り下げ
                            </button>
                          ) : canSettle ? (
                            <button
                              className="btn-primary py-1.5 px-3 text-xs disabled:opacity-50"
                              disabled={market.actionPending}
                              onClick={() => void market.settleListing(row.id)}
                            >
                              受渡を再実行
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">配当履歴</h2>
            <span className="text-xs text-slate-400">全 {allocations.length} 件</span>
          </div>

          {claimSuccess && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
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
              <p className="text-slate-600 font-semibold">配当履歴がありません</p>
              <p className="text-slate-400 text-sm mt-1">配当サイクル完了後に自動記録されます</p>
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

        <section className="card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">オンチェーン情報</h3>
            <p className="text-xs text-slate-500">
              収益権は ERC-1155 トークンとして Polygon Amoy 上に記録されます。配当受取と市場売買は
              すべてオンチェーン取引を検証して反映されます。
            </p>
          </div>
          <a
            href="https://amoy.polygonscan.com"
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
