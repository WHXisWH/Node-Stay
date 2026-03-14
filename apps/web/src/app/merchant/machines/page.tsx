'use client';

// 加盟店マシン一覧ページ（View 層：useMerchantMachines の戻り値を表示のみ）

import Link from 'next/link';
import { useMerchantMachines } from '../../../hooks';
import type { MachineListItem, MachineStatus } from '../../../hooks/useMerchantMachines';

// ===== マシンクラス設定 =====
const CLASS_CONFIG: Record<string, { label: string; className: string }> = {
  GPU:      { label: 'GPU',      className: 'bg-purple-100 text-purple-700' },
  CPU:      { label: 'CPU',      className: 'bg-blue-100 text-blue-700' },
  PREMIUM:  { label: 'Premium',  className: 'bg-amber-100 text-amber-700' },
  STANDARD: { label: 'Standard', className: 'bg-slate-100 text-slate-600' },
};

// ===== ステータス設定 =====
const STATUS_CONFIG: Record<MachineStatus, { label: string; dotColor: string; badgeClass: string }> = {
  ACTIVE:         { label: '稼働中',    dotColor: 'bg-emerald-400', badgeClass: 'badge-green' },
  PAUSED:         { label: '一時停止',  dotColor: 'bg-amber-400',   badgeClass: 'badge-yellow' },
  MAINTENANCE:    { label: 'メンテ中', dotColor: 'bg-red-400',     badgeClass: 'badge-red' },
  REGISTERED:     { label: '登録済み', dotColor: 'bg-slate-300',   badgeClass: 'badge-gray' },
  DECOMMISSIONED: { label: '廃止済み', dotColor: 'bg-slate-200',   badgeClass: 'badge-gray' },
};

const NEXT_STATUS: Partial<Record<MachineStatus, MachineStatus[]>> = {
  ACTIVE:      ['PAUSED', 'MAINTENANCE'],
  PAUSED:      ['ACTIVE', 'MAINTENANCE'],
  MAINTENANCE: ['ACTIVE'],
  REGISTERED:  ['ACTIVE'],
};

// ===== フィルタータブ =====
const FILTER_TABS: { key: 'all' | MachineStatus; label: string }[] = [
  { key: 'all',         label: 'すべて' },
  { key: 'REGISTERED',  label: '登録済み' },
  { key: 'ACTIVE',      label: '稼働中' },
  { key: 'PAUSED',      label: '一時停止' },
  { key: 'MAINTENANCE', label: 'メンテ中' },
];
const EXTRA_FILTER_TABS: { key: 'onchain'; label: string }[] = [
  { key: 'onchain', label: 'オンチェーン登録済み' },
];

const VENUE_ALL_VALUE = 'all';

// ===== マシンカードコンポーネント =====
function MachineCard({
  machine,
  onStatusChange,
  onRemove,
  updating,
  removing,
}: {
  machine: MachineListItem;
  onStatusChange: (id: string, s: MachineStatus) => void;
  onRemove: (id: string) => void;
  updating: boolean;
  removing: boolean;
}) {
  const classCfg = CLASS_CONFIG[machine.machineClass] ?? CLASS_CONFIG.STANDARD;
  const statusCfg = STATUS_CONFIG[machine.status];
  const nextStatuses = NEXT_STATUS[machine.status] ?? [];

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${classCfg.className}`}>
              {classCfg.label}
            </span>
            {machine.onchainTokenId ? (
              <span className="text-xs text-slate-400">トークン #{machine.onchainTokenId}</span>
            ) : (
              <span className="text-xs text-amber-500">オンチェーン未登録</span>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900 truncate">{machine.label}</h3>
          <p className="text-xs text-slate-400 mt-1 truncate">{machine.venueName}</p>
        </div>
        <span className={`${statusCfg.badgeClass} flex-shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor} inline-block mr-1`} />
          {statusCfg.label}
        </span>
      </div>

      {/* スペック */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div>
          <span className="text-slate-400">CPU</span>
          <p className="font-medium text-slate-700 truncate">{machine.cpu}</p>
        </div>
        <div>
          <span className="text-slate-400">GPU</span>
          <p className="font-medium text-slate-700 truncate">{machine.gpu ?? '—'}</p>
        </div>
        <div>
          <span className="text-slate-400">RAM</span>
          <p className="font-medium text-slate-700">{machine.ramGb} GB</p>
        </div>
        <div>
          <span className="text-slate-400">ストレージ</span>
          <p className="font-medium text-slate-700">{machine.storageGb} GB</p>
        </div>
      </div>

      {/* 収益サマリー */}
      <div className="flex gap-4 text-sm border-t border-slate-50 pt-3">
        <div>
          <p className="text-xs text-slate-400">累計収益</p>
          <p className="font-bold text-slate-800">
            {(machine.earningsTotalMinor / 100).toLocaleString('ja-JP')} JPYC
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">セッション総数</p>
          <p className="font-bold text-slate-800">{machine.sessionsTotal}回</p>
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="flex flex-col gap-2 pt-1">
        {nextStatuses.length > 0 && (
          <div className="flex gap-2">
            {nextStatuses.map((s) => (
              <button
                key={s}
                disabled={updating || removing}
                onClick={() => onStatusChange(machine.id, s)}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                {updating ? '更新中...' : STATUS_CONFIG[s].label + 'にする'}
              </button>
            ))}
          </div>
        )}
        <button
          disabled={updating || removing}
          onClick={() => onRemove(machine.id)}
          className="w-full py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 transition-colors disabled:opacity-50"
        >
          {removing ? '削除中...' : 'このマシンを削除'}
        </button>
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function MerchantMachinesPage() {
  const {
    venues,
    selectedVenueId,
    setSelectedVenueId,
    machines,
    filtered,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    updatingId,
    removingId,
    removeError,
    handleStatusChange,
    handleRemove,
    loading,
  } = useMerchantMachines();

  const onDelete = (id: string) => {
    if (!window.confirm('このマシンを削除します。よろしいですか？')) return;
    void handleRemove(id);
  };

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/merchant/dashboard" className="hover:text-slate-300 transition-colors">ダッシュボード</Link>
            <span>/</span>
            <span className="text-slate-300">マシン管理</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">マシン管理</h1>
              <p className="text-slate-400">
                登録済み：
                <span className="text-white font-semibold ml-1">{machines.length}台</span>
                （稼働中：{machines.filter((m) => m.status === 'ACTIVE').length}台）
              </p>
            </div>
            <Link href="/merchant/machines/register" className="btn-jpyc py-2.5 text-sm">
              新しいマシンを登録
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8">
        {removeError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {removeError}
          </div>
        )}

        {/* フィルター・検索 */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* 店舗選択 */}
            <div className="sm:w-72">
              <select
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              >
                <option value={VENUE_ALL_VALUE}>すべての店舗</option>
                {venues.map((venue) => (
                  <option key={venue.venueId} value={venue.venueId}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 検索 */}
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="マシン名・CPU・GPU・店舗名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>
          </div>

          {/* フィルタータブ */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-auto">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  filterStatus === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {EXTRA_FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  filterStatus === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* マシングリッド */}
        {loading ? (
          <div className="text-center py-20">
            <h3 className="text-lg font-bold text-slate-700 mb-2">読み込み中...</h3>
            <p className="text-slate-400 text-sm">マシン情報を取得しています。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🖥</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">マシンが見つかりません</h3>
            <p className="text-slate-400 text-sm mb-6">
              {searchQuery ? '検索条件を変更してください' : '新しいマシンを登録しましょう'}
            </p>
            {!searchQuery && (
              <Link href="/merchant/machines/register" className="btn-primary">
                マシンを登録する
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((machine) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                onStatusChange={handleStatusChange}
                onRemove={onDelete}
                updating={updatingId === machine.id}
                removing={removingId === machine.id}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
