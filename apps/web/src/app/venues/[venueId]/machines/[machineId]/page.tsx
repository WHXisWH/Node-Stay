'use client';

// マシン詳細ページ（View 層：useMachineDetailPage の戻り値を表示のみ）

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMachineDetailPage } from '../../../../../hooks';
import type { MachineDetail, SlotWindow } from '../../../../../hooks';

// ===== マシンクラス表示名マッピング =====
const MACHINE_CLASS_LABEL: Record<MachineDetail['machineClass'], string> = {
  GPU: 'GPU ノード',
  CPU: 'CPU ノード',
  STANDARD: '標準',
  PREMIUM: 'プレミアム',
};

// ===== ステータスバッジ設定 =====
const STATUS_BADGE: Record<
  MachineDetail['status'],
  { label: string; className: string }
> = {
  ACTIVE:        { label: '稼働中',        className: 'badge-green' },
  PAUSED:        { label: '一時停止',      className: 'badge-yellow' },
  REGISTERED:    { label: '登録済',        className: 'badge-gray' },
  MAINTENANCE:   { label: 'メンテナンス中', className: 'badge-yellow' },
  DECOMMISSIONED:{ label: '廃止',          className: 'badge-gray' },
};

// ===== オンチェーンハッシュの短縮表示ユーティリティ =====
function shortenHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

// ===== スペック行コンポーネント =====
function SpecRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 text-brand-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">
          {value ?? '—'}
        </p>
      </div>
    </div>
  );
}

// ===== スロットセルコンポーネント =====
function SlotCell({ slot }: { slot: SlotWindow }) {
  // from から時刻を取得
  const fromDate = new Date(slot.from);
  const hourLabel = `${String(fromDate.getHours()).padStart(2, '0')}:00`;

  // ステータスに応じたスタイル
  const statusStyle: Record<SlotWindow['status'], { bg: string; text: string; label: string }> = {
    AVAILABLE: {
      bg: 'bg-emerald-100 hover:bg-emerald-200 cursor-pointer',
      text: 'text-emerald-700',
      label: '',
    },
    OCCUPIED: {
      bg: 'bg-slate-100',
      text: 'text-slate-400',
      label: '使用中',
    },
    BLOCKED: {
      bg: 'bg-slate-200',
      text: 'text-slate-500',
      label: 'ブロック',
    },
  };

  const style = statusStyle[slot.status];

  return (
    <div
      className={`rounded-lg p-2 text-center transition-colors ${style.bg}`}
    >
      <p className={`text-xs font-bold ${style.text}`}>{hourLabel}</p>
      {style.label && (
        <p className={`text-xs mt-0.5 ${style.text}`}>{style.label}</p>
      )}
    </div>
  );
}

// ===== ローディング表示 =====
function LoadingState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">読み込み中...</p>
    </div>
  );
}

// ===== 404 表示 =====
function NotFoundState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 gap-4">
      <p className="text-6xl font-extrabold text-slate-200">404</p>
      <h2 className="text-xl font-bold text-slate-700">マシンが見つかりません</h2>
      <p className="text-slate-400 text-sm">
        指定されたマシンIDは存在しないか、削除されました。
      </p>
      <Link href="/venues" className="btn-secondary mt-2">
        店舗一覧へ戻る
      </Link>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function MachineDetailPage() {
  const params = useParams<{ venueId: string; machineId: string }>();
  const venueId = params.venueId as string;
  const machineId = params.machineId as string;

  const {
    machine,
    slots,
    loading,
    notFound,
    slotsLoading,
    selectedDate,
    setSelectedDate,
  } = useMachineDetailPage(machineId);

  // ローディング中
  if (loading) return <LoadingState />;

  // 404
  if (notFound || !machine) return <NotFoundState />;

  const statusBadge = STATUS_BADGE[machine.status];
  const classLabel = MACHINE_CLASS_LABEL[machine.machineClass];

  return (
    <>
      {/* ===== ページヘッダー（ダーク背景） ===== */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap">
            <Link href="/" className="hover:text-slate-300 transition-colors">
              ホーム
            </Link>
            <span>/</span>
            <Link href="/venues" className="hover:text-slate-300 transition-colors">
              店舗を探す
            </Link>
            <span>/</span>
            <Link
              href={`/venues/${venueId}`}
              className="hover:text-slate-300 transition-colors"
            >
              {machine.venueName}
            </Link>
            <span>/</span>
            <span className="text-slate-300">マシン詳細</span>
          </nav>

          {/* マシンクラスバッジ・名称 */}
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {/* マシンクラスバッジ */}
                <span className="inline-flex items-center px-3 py-1 bg-brand-600/20 text-brand-300 text-xs font-bold rounded-full border border-brand-500/30">
                  {classLabel}
                </span>
                {/* ステータスバッジ */}
                <span className={statusBadge.className}>{statusBadge.label}</span>
              </div>

              {/* マシン名 */}
              <h1 className="text-3xl font-extrabold text-white mb-2">
                {machine.label}
              </h1>

              {/* 店舗住所 */}
              <p className="text-slate-400 text-sm flex items-center gap-1.5">
                {/* 位置アイコン */}
                <svg viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {machine.venueAddress}
              </p>

              {/* オンチェーンTokenId（存在する場合のみ表示） */}
              {machine.onchainTokenId && (
                <p className="mt-2 text-xs text-slate-500 font-mono">
                  Token ID: {shortenHash(machine.onchainTokenId)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== メインコンテンツ ===== */}
      <div className="container-main py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ===== 左カラム ===== */}
          <div className="lg:col-span-1 flex flex-col gap-6">

            {/* スペックカード */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                {/* チップアイコン */}
                <svg viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="4" />
                  <rect x="8" y="8" width="8" height="8" />
                  <line x1="12" y1="2" x2="12" y2="8" />
                  <line x1="12" y1="16" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="8" y2="12" />
                  <line x1="16" y1="12" x2="22" y2="12" />
                </svg>
                スペック
              </h2>

              {/* CPU */}
              <SpecRow
                icon={
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="2" width="20" height="20" rx="3" />
                    <rect x="8" y="8" width="8" height="8" />
                  </svg>
                }
                label="CPU"
                value={machine.spec.cpu}
              />

              {/* GPU */}
              <SpecRow
                icon={
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                }
                label="GPU"
                value={machine.spec.gpu}
              />

              {/* RAM */}
              <SpecRow
                icon={
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <line x1="6" y1="6" x2="6" y2="18" />
                    <line x1="10" y1="6" x2="10" y2="18" />
                    <line x1="14" y1="6" x2="14" y2="18" />
                    <line x1="18" y1="6" x2="18" y2="18" />
                  </svg>
                }
                label="RAM"
                value={machine.spec.ramGb != null ? `${machine.spec.ramGb} GB` : null}
              />

              {/* ストレージ */}
              <SpecRow
                icon={
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" />
                  </svg>
                }
                label="ストレージ"
                value={
                  machine.spec.storageGb != null
                    ? machine.spec.storageGb >= 1000
                      ? `${machine.spec.storageGb / 1000} TB`
                      : `${machine.spec.storageGb} GB`
                    : null
                }
              />
            </div>

            {/* 稼働実績カード */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                {/* グラフアイコン */}
                <svg viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                稼働実績
              </h2>

              {/* セッション数 */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-sm text-slate-500">セッション数</span>
                <span className="text-lg font-extrabold text-slate-800">
                  {machine.sessionsTotal.toLocaleString('ja-JP')}
                  <span className="text-sm font-normal text-slate-400 ml-1">回</span>
                </span>
              </div>

              {/* 累計収益 */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-slate-500">累計収益</span>
                <span className="text-lg font-extrabold text-jpyc-600">
                  {(machine.earningsTotalMinor / 100).toLocaleString('ja-JP')}
                  <span className="text-sm font-semibold text-jpyc-500 ml-1">JPYC</span>
                </span>
              </div>
            </div>

            {/* オンチェーン情報カード */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                {/* リンクアイコン */}
                <svg viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                オンチェーン情報
              </h2>

              {/* Token ID */}
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">Token ID</p>
                <p className="text-sm font-mono text-slate-700 break-all bg-slate-50 rounded-lg px-3 py-2">
                  {machine.onchainTokenId ? shortenHash(machine.onchainTokenId) : '—'}
                </p>
              </div>

              {/* Tx Hash */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Tx Hash</p>
                <p className="text-sm font-mono text-slate-700 break-all bg-slate-50 rounded-lg px-3 py-2">
                  {machine.onchainTxHash ? shortenHash(machine.onchainTxHash) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ===== 右カラム ===== */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* 利用可能時間帯カード */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  {/* カレンダーアイコン */}
                  <svg viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  利用可能時間帯
                </h2>

                {/* 日付セレクター */}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
              </div>

              {/* スロット読み込み中 */}
              {slotsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* 24時間スロットグリッド */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 mb-5">
                    {slots.map((slot) => (
                      <SlotCell key={slot.from} slot={slot} />
                    ))}
                  </div>

                  {/* 凡例 */}
                  <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-emerald-200 flex-shrink-0" />
                      <span>利用可能</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-slate-200 flex-shrink-0" />
                      <span>使用中</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-slate-300 flex-shrink-0" />
                      <span>ブロック</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* アクションカード（稼働中のみ表示） */}
            {machine.status === 'ACTIVE' && (
              <div className="card p-6">
                <h2 className="text-base font-bold text-slate-800 mb-4">アクション</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* 予約ボタン */}
                  <Link
                    href={`/venues/${venueId}`}
                    className="btn-jpyc flex-1 text-center"
                  >
                    この時間帯を予約する
                  </Link>

                  {/* コンピュートジョブ投稿ボタン（computeEnabled の場合のみ） */}
                  {machine.computeEnabled && (
                    <Link
                      href="/compute"
                      className="btn-secondary flex-1 text-center"
                    >
                      コンピュートジョブを投稿
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
