'use client';

// 加盟店ダッシュボード（View 層：useMerchantDashboard の戻り値を表示のみ）

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMerchantDashboard } from '../../../hooks';
import type { MachineUtilization } from '../../../hooks/useMerchantDashboard';
import { createNodeStayClient } from '../../../services/nodestay';
import { useUserState } from '../../../hooks/useUserState';

// ===== 金額フォーマット =====
function formatJPYC(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP');
}

// ===== マシンクラスバッジ =====
const CLASS_CONFIG: Record<string, { label: string; className: string }> = {
  GPU:      { label: 'GPU',      className: 'bg-purple-100 text-purple-700' },
  CPU:      { label: 'CPU',      className: 'bg-blue-100 text-blue-700' },
  PREMIUM:  { label: 'Premium',  className: 'bg-amber-100 text-amber-700' },
  STANDARD: { label: 'Standard', className: 'bg-slate-100 text-slate-600' },
};

// ===== ステータスバッジ =====
const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  ACTIVE:      { label: '稼働中',    dot: 'bg-emerald-400' },
  PAUSED:      { label: '一時停止',  dot: 'bg-amber-400' },
  MAINTENANCE: { label: 'メンテ中', dot: 'bg-red-400' },
  REGISTERED:  { label: '登録済み', dot: 'bg-slate-300' },
};

// ===== 稼働率ゲージ =====
function UptimeBar({ percent }: { percent: number }) {
  const color =
    percent >= 70 ? 'bg-emerald-500' :
    percent >= 40 ? 'bg-amber-500' :
    'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-10 text-right">{percent}%</span>
    </div>
  );
}

// ===== マシン稼働カード =====
function MachineRow({ machine }: { machine: MachineUtilization }) {
  const classCfg = CLASS_CONFIG[machine.machineClass] ?? CLASS_CONFIG.STANDARD;
  const statusCfg = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.REGISTERED;

  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-50 last:border-0">
      {/* マシン名・クラス */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${classCfg.className}`}>
            {classCfg.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-800 truncate">{machine.label}</p>
      </div>

      {/* 稼働率 */}
      <div className="w-36 hidden sm:block">
        <p className="text-xs text-slate-400 mb-1">稼働率</p>
        <UptimeBar percent={machine.uptimePercent} />
      </div>

      {/* セッション数 */}
      <div className="text-right hidden md:block w-16">
        <p className="text-xs text-slate-400">セッション</p>
        <p className="text-sm font-bold text-slate-800">{machine.sessionsThisMonth}</p>
      </div>

      {/* 今月収益 */}
      <div className="text-right w-24">
        <p className="text-xs text-slate-400">今月収益</p>
        <p className="text-sm font-bold text-brand-700">{formatJPYC(machine.earningsThisMonthMinor)} <span className="text-xs font-normal">JPYC</span></p>
      </div>
    </div>
  );
}

// ===== KPI カード =====
function KpiCard({
  label,
  value,
  sub,
  growth,
}: {
  label: string;
  value: string;
  sub: string;
  growth?: number;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900 mb-1">{value}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{sub}</p>
        {growth !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${growth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {growth >= 0 ? '+' : ''}{growth}%
          </span>
        )}
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function MerchantDashboardPage() {
  const { venueId, venueName, revenue, machines, sessions, selectedPeriod, setSelectedPeriod } = useMerchantDashboard();
  const { isAuthenticated } = useUserState();
  const [treasuryWalletInput, setTreasuryWalletInput] = useState('');
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasurySaving, setTreasurySaving] = useState(false);
  const [treasuryError, setTreasuryError] = useState('');
  const [treasuryNotice, setTreasuryNotice] = useState('');

  const periodRevenue =
    selectedPeriod === 'week'  ? revenue.thisMonthMinor / 4 :
    selectedPeriod === 'month' ? revenue.thisMonthMinor :
    revenue.totalMinor;

  const periodLabel =
    selectedPeriod === 'week'  ? '今週' :
    selectedPeriod === 'month' ? '今月' :
    '累計';

  useEffect(() => {
    if (!venueId) return;
    const client = createNodeStayClient();
    setTreasuryLoading(true);
    setTreasuryError('');
    setTreasuryNotice('');
    void client.getVenueTreasuryWallet(venueId)
      .then((res) => {
        setTreasuryWalletInput(res.treasuryWallet ?? '');
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '受取ウォレット情報の取得に失敗しました';
        setTreasuryError(msg);
      })
      .finally(() => setTreasuryLoading(false));
  }, [venueId]);

  const handleSaveTreasuryWallet = async () => {
    if (!venueId) return;
    const wallet = treasuryWalletInput.trim();
    if (!wallet) {
      setTreasuryError('受取ウォレットアドレスを入力してください');
      setTreasuryNotice('');
      return;
    }

    setTreasurySaving(true);
    setTreasuryError('');
    setTreasuryNotice('');
    try {
      const client = createNodeStayClient();
      const res = await client.upsertVenueTreasuryWallet(venueId, wallet);
      setTreasuryWalletInput(res.treasuryWallet);
      setTreasuryNotice('受取ウォレットを更新しました');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '受取ウォレットの更新に失敗しました';
      setTreasuryError(msg);
    } finally {
      setTreasurySaving(false);
    }
  };

  const handleOpenLogin = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('nodestay:open-login-modal'));
  };

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/merchant" className="hover:text-slate-300 transition-colors">加盟店管理</Link>
            <span>/</span>
            <span className="text-slate-300">ダッシュボード</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-slate-400 text-sm mb-1">加盟店管理</p>
              <h1 className="text-3xl font-extrabold text-white">{venueName || '店舗未設定'}</h1>
            </div>
            {/* クイックリンク */}
            <div className="flex gap-2">
              <Link href="/merchant/machines" className="btn-secondary py-2 px-4 text-sm">
                マシン管理
              </Link>
              <Link href="/merchant/revenue-programs" className="btn-secondary py-2 px-4 text-sm">
                収益プログラム
              </Link>
              <Link href="/merchant/machines/register" className="btn-primary py-2 px-4 text-sm">
                マシン登録
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8 flex flex-col gap-8">
        {!isAuthenticated && (
          <div className="card p-4 border border-amber-200 bg-amber-50 text-amber-800">
            <p className="text-sm font-semibold">加盟店ダッシュボードの利用にはログインが必要です。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={handleOpenLogin} className="btn-primary py-2 px-4 text-sm">
                ここからログイン
              </button>
              <Link href="/?redirect=/merchant/dashboard" className="btn-secondary py-2 px-4 text-sm">
                ホームへ戻ってログイン
              </Link>
            </div>
          </div>
        )}
        {isAuthenticated && !venueId && (
          <div className="card p-4 border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold">
            加盟店店舗が未設定です。先に店舗を作成してください。
          </div>
        )}

        {/* 期間セレクター */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(['week', 'month', 'total'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                selectedPeriod === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'week' ? '今週' : p === 'month' ? '今月' : '累計'}
            </button>
          ))}
        </div>

        {/* KPI グリッド */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={`${periodLabel}収益`}
            value={`${formatJPYC(periodRevenue)} JPYC`}
            sub={`先月比`}
            growth={revenue.growthPercent}
          />
          <KpiCard
            label="今月セッション"
            value={`${sessions.thisMonth}件`}
            sub={`今週 ${sessions.thisWeek} 件 / 本日 ${sessions.today} 件`}
          />
          <KpiCard
            label="平均利用時間"
            value={`${Math.floor(sessions.avgDurationMinutes / 60)}時間${sessions.avgDurationMinutes % 60}分`}
            sub="1セッションあたり"
          />
          <KpiCard
            label="稼働マシン"
            value={`${machines.filter((m) => m.status === 'ACTIVE').length}台`}
            sub={`全${machines.length}台中`}
          />
        </div>

        {/* マシン稼働状況 */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-slate-900">マシン稼働状況</h2>
            <Link href="/merchant/machines" className="text-sm text-brand-600 hover:text-brand-800 font-semibold transition-colors">
              すべて見る →
            </Link>
          </div>
          <div>
            {machines.map((m) => (
              <MachineRow key={m.machineId} machine={m} />
            ))}
          </div>
        </div>

        {/* セッション統計 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 受取ウォレット設定 */}
          <div className="card p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3">受取ウォレット設定</h2>
            <p className="text-sm text-slate-500 mb-4">
              セッション決済の店舗取り分（JPYC）受取先です。未設定だと一部決済が失敗します。
            </p>

            <label className="text-xs font-semibold text-slate-500 mb-2 block">
              受取ウォレット（Polygon）
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="0x..."
              value={treasuryWalletInput}
              onChange={(e) => setTreasuryWalletInput(e.target.value)}
              disabled={treasuryLoading || treasurySaving || !venueId}
            />

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveTreasuryWallet}
                disabled={treasuryLoading || treasurySaving || !venueId}
                className="btn-primary py-2 px-4 text-sm disabled:opacity-50"
              >
                {treasurySaving ? '更新中...' : '受取先を保存'}
              </button>
              {treasuryLoading && <span className="text-xs text-slate-500">読み込み中...</span>}
            </div>

            {!!treasuryNotice && <p className="mt-3 text-sm text-emerald-600">{treasuryNotice}</p>}
            {!!treasuryError && <p className="mt-3 text-sm text-red-600 break-all">{treasuryError}</p>}
          </div>

          {/* 収益内訳 */}
          <div className="card p-6">
            <h2 className="text-base font-bold text-slate-900 mb-5">収益内訳（今月）</h2>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">利用権収益</span>
                <span className="font-bold text-slate-800">{formatJPYC(revenue.thisMonthMinor * 0.7)} JPYC</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">コンピュートレンタル収益</span>
                <span className="font-bold text-slate-800">{formatJPYC(revenue.thisMonthMinor * 0.25)} JPYC</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">その他</span>
                <span className="font-bold text-slate-800">{formatJPYC(revenue.thisMonthMinor * 0.05)} JPYC</span>
              </div>
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-slate-800">合計</span>
                <span className="text-lg font-extrabold text-brand-700">{formatJPYC(revenue.thisMonthMinor)} JPYC</span>
              </div>
            </div>
          </div>

          {/* クイックアクション */}
          <div className="card p-6">
            <h2 className="text-base font-bold text-slate-900 mb-5">クイックアクション</h2>
            <div className="flex flex-col gap-3">
              <Link href="/merchant/machines/register" className="btn-primary w-full text-center py-3">
                新しいマシンを登録する
              </Link>
              <Link href="/merchant/machines" className="btn-secondary w-full text-center py-3">
                マシン一覧・ステータス管理
              </Link>
              <Link href="/merchant/compute" className="btn-secondary w-full text-center py-3">
                コンピュートノード管理
              </Link>
              <Link href="/merchant/revenue-programs" className="btn-secondary w-full text-center py-3">
                収益権プログラム管理
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
