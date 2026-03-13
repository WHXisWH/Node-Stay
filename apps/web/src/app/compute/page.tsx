'use client';

// コンピュートマーケットページ（View 層：useComputePage の戻り値を表示のみ、SPEC V3）

import { useState } from 'react';
import Link from 'next/link';
import { useComputePage } from '../../hooks';
import { useJPYCTransfer } from '../../hooks/useJPYC';
import { CONTRACT_ADDRESSES } from '../../services/config';
import type { ComputeNode, ComputeJob, TaskType } from '../../models/compute.model';
import type { NodeStatus, JobStatus } from '../../models/compute.model';

// ===== ユーティリティ（View 表示用） =====

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: string; color: string }> = {
  ML_TRAINING: { label: 'AI / ML 学習', icon: '🤖', color: 'bg-violet-100 text-violet-700' },
  RENDERING: { label: '3DCG レンダリング', icon: '🎨', color: 'bg-orange-100 text-orange-700' },
  ZK_PROVING: { label: 'ZK 証明生成', icon: '🔐', color: 'bg-blue-100 text-blue-700' },
  GENERAL: { label: '汎用計算', icon: '⚙️', color: 'bg-slate-100 text-slate-700' },
};

// ノードステータス設定
const NODE_STATUS_CONFIG: Record<NodeStatus, { label: string; dot: string; badge: string }> = {
  IDLE: { label: '利用可能', dot: 'bg-emerald-400', badge: 'badge-green' },
  RESERVED: { label: '予約済み', dot: 'bg-amber-400', badge: 'badge-yellow' },
  COMPUTING: { label: '計算中', dot: 'bg-blue-400 animate-pulse', badge: 'badge-blue' },
  OFFLINE: { label: 'オフライン', dot: 'bg-slate-300', badge: 'badge-gray' },
};

// ジョブステータス設定
const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; badge: string }> = {
  PENDING: { label: '待機中', badge: 'badge-yellow' },
  ASSIGNED: { label: 'ノード割当済み', badge: 'badge-blue' },
  RUNNING: { label: '実行中', badge: 'bg-blue-100 text-blue-700 badge' },
  COMPLETED: { label: '完了', badge: 'badge-green' },
  FAILED: { label: '失敗', badge: 'badge-red' },
  CANCELLED: { label: 'キャンセル', badge: 'badge-gray' },
};

// JPYCフォーマット
function formatJPYC(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP');
}

// ===== 統計バナー =====
function StatsBanner({ nodes, myJobs }: { nodes: ComputeNode[]; myJobs: ComputeJob[] }) {
  const onlineCount = nodes.filter((n) => n.availableNow).length;
  const avgPriceMinor = nodes.length > 0
    ? Math.round(nodes.reduce((sum, n) => sum + n.pricePerHourMinor, 0) / nodes.length)
    : 0;
  const activeCount = nodes.filter((n) => n.status === 'COMPUTING' || n.status === 'RESERVED').length;
  const utilization = nodes.length > 0 ? ((activeCount / nodes.length) * 100).toFixed(1) : '0.0';
  const pendingJobs = myJobs.filter((j) => j.status === 'PENDING' || j.status === 'ASSIGNED').length;
  const assignLatency = pendingJobs > 0 ? '~1-3分' : '-';

  const stats = [
    { value: `${onlineCount}台`, label: 'オンライン中のノード', icon: '🖥️' },
    { value: `${formatJPYC(avgPriceMinor)} JPYC`, label: '平均時間単価', icon: '💴' },
    { value: `${utilization}%`, label: '現在稼働率', icon: '📈' },
    { value: assignLatency, label: 'ジョブ割当目安', icon: '⚡' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {stats.map((s) => (
        <div key={s.label} className="card p-4 text-center">
          <div className="text-2xl mb-1">{s.icon}</div>
          <div className="text-xl font-extrabold text-slate-900">{s.value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ===== ノードカード =====
function NodeCard({ node, onBook }: { node: ComputeNode; onBook: (node: ComputeNode) => void }) {
  const statusCfg = NODE_STATUS_CONFIG[node.status];

  return (
    <div className={`card p-5 flex flex-col gap-4 ${!node.availableNow ? 'opacity-60' : ''}`}>
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
            <span className={statusCfg.badge}>{statusCfg.label}</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 truncate mt-1">{node.venueName ?? ''}</h3>
          <p className="text-xs text-slate-400 truncate">{node.address ?? ''}</p>
        </div>
      </div>

      {/* GPU スペック（強調表示） */}
      <div
        className="rounded-xl p-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)' }}
      >
        <div className="text-2xl">🎮</div>
        <div>
          <div className="text-white font-bold text-sm">{node.specs.gpuModel}</div>
          <div className="text-slate-300 text-xs">{node.specs.vram}GB VRAM · {node.specs.ram}GB RAM</div>
        </div>
      </div>

      {/* CPU スペック */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 rounded-lg p-2">
          <div className="text-slate-400 mb-0.5">CPU</div>
          <div className="font-semibold text-slate-700 truncate">{node.specs.cpuModel}</div>
          <div className="text-slate-400">{node.specs.cpuCores}コア</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2">
          <div className="text-slate-400 mb-0.5">予約時間</div>
          <div className="font-semibold text-slate-700">
            {node.minBookingHours}〜{node.maxBookingHours}時間
          </div>
        </div>
      </div>

      {/* 対応タスク */}
      <div className="flex flex-wrap gap-1">
        {node.supportedTasks.map((t) => {
          const cfg = TASK_TYPE_CONFIG[t];
          return (
            <span key={t} className={`badge text-xs ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          );
        })}
      </div>

      {/* 価格 & ボタン */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-50">
        <div>
          <span className="text-xl font-extrabold text-slate-900">
            {formatJPYC(node.pricePerHourMinor)}
          </span>
          <span className="text-sm text-jpyc-500 font-semibold ml-1">JPYC</span>
          <span className="text-xs text-slate-400 ml-1">/ 時間</span>
        </div>
        <button
          onClick={() => onBook(node)}
          disabled={!node.availableNow}
          className="btn-primary py-2 px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          予約する
        </button>
      </div>
    </div>
  );
}

// ===== ジョブ一覧行 =====
function JobRow({ job }: { job: ComputeJob }) {
  const statusCfg = JOB_STATUS_CONFIG[job.status];
  const taskCfg = TASK_TYPE_CONFIG[job.taskType];

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-xl flex-shrink-0">{taskCfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{taskCfg.label}</span>
            <span className={statusCfg.badge}>{statusCfg.label}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">{job.venueName ?? ''}</p>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold text-slate-800">
          {formatJPYC(job.priceMinor ?? 0)} JPYC
        </div>
        <div className="text-xs text-slate-400">
          {job.actualHours
            ? `実績 ${job.actualHours}h`
            : `推定 ${job.estimatedHours}h`}
        </div>
      </div>

      {/* 結果ハッシュリンク（完了時のみ） */}
      {job.resultHash && (
        <div className="flex-shrink-0">
          <span className="badge-green text-xs">結果検証済み ✓</span>
        </div>
      )}
    </div>
  );
}

// ===== ジョブ送信モーダル =====
function JobSubmitModal({
  node,
  onClose,
  onSubmit,
  submitting,
}: {
  node: ComputeNode;
  onClose: () => void;
  onSubmit: (hours: number, taskType: TaskType) => void;
  submitting: boolean;
}) {
  // 予約時間の状態
  const [hours, setHours] = useState(node.minBookingHours);
  // タスク種別の状態
  const [taskType, setTaskType] = useState<TaskType>(node.supportedTasks?.[0] ?? 'GENERAL');

  // 合計金額の計算
  const totalMinor = node.pricePerHourMinor * hours;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">コンピュートジョブを予約</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        {/* ノード情報 */}
        <div
          className="rounded-xl p-4 mb-5 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)' }}
        >
          <div className="text-3xl">🖥️</div>
          <div>
            <div className="text-white font-bold">{node.specs.gpuModel}</div>
            <div className="text-slate-300 text-sm">{node.venueName ?? ''}</div>
          </div>
        </div>

        {/* タスク種別選択 */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            タスク種別
          </label>
          <div className="grid grid-cols-2 gap-2">
            {node.supportedTasks.map((t) => {
              const cfg = TASK_TYPE_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => setTaskType(t)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    taskType === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="text-base">{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 予約時間スライダー */}
        <div className="mb-5">
          <div className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
            <label>予約時間</label>
            <span className="text-brand-600">{hours} 時間</span>
          </div>
          <input
            type="range"
            min={node.minBookingHours}
            max={node.maxBookingHours}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>最短 {node.minBookingHours}h</span>
            <span>最長 {node.maxBookingHours}h</span>
          </div>
        </div>

        {/* 料金サマリー */}
        <div className="bg-slate-50 rounded-xl p-4 mb-5 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">単価</span>
            <span className="font-semibold">{formatJPYC(node.pricePerHourMinor)} JPYC / 時間</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">予約時間</span>
            <span className="font-semibold">{hours} 時間</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>決済方法</span>
            <span>JPYC オンチェーン送金</span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
            <span className="font-bold text-slate-800">合計支払い額</span>
            <span className="text-xl font-extrabold text-brand-700">
              {formatJPYC(totalMinor)} JPYC
            </span>
          </div>
        </div>

        {/* 注意書き */}
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          ※ 送信時に JPYC を算力権コントラクトへ支払い、支払い tx を検証後にジョブを作成します。
        </p>

        {/* ボタン */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={submitting}>
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(hours, taskType)}
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                送信中...
              </span>
            ) : (
              'ジョブを送信する'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 収益概要パネル（店舗オペレーター向け） =====
function EarningsSummary({ nodes, myJobs }: { nodes: ComputeNode[]; myJobs: ComputeJob[] }) {
  const completed = myJobs.filter((j) => j.status === 'COMPLETED');
  const totalRevenueMinor = completed.reduce((sum, j) => sum + (j.priceMinor ?? 0), 0);
  const feeMinor = Math.floor(totalRevenueMinor * 0.25);
  const activeCount = nodes.filter((n) => n.status === 'COMPUTING' || n.status === 'RESERVED').length;
  const utilization = nodes.length > 0 ? ((activeCount / nodes.length) * 100).toFixed(1) : '0.0';

  const earnings = [
    { label: '今月のコンピュート収益', value: formatJPYC(totalRevenueMinor), unit: 'JPYC', trend: `${completed.length}件`, up: completed.length > 0 },
    { label: '完了ジョブ数', value: `${completed.length}`, unit: '件', trend: `${myJobs.length}件中`, up: completed.length > 0 },
    { label: '現在稼働率', value: utilization, unit: '%', trend: `${activeCount}/${nodes.length || 0}台`, up: activeCount > 0 },
    { label: 'プラットフォーム手数料', value: formatJPYC(feeMinor), unit: 'JPYC', trend: '25%', up: false },
  ];

  return (
    <div className="card overflow-hidden mb-8">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">コンピュート収益サマリー（今月）</h2>
        <Link
          href="/merchant/settlements"
          className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1"
        >
          詳細レポート
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-50">
        {earnings.map((e) => (
          <div key={e.label} className="px-5 py-4">
            <p className="text-xs text-slate-400 mb-1">{e.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-900">{e.value}</span>
              <span className="text-sm text-slate-500">{e.unit}</span>
            </div>
            <span
              className={`text-xs font-semibold mt-1 inline-block ${
                e.up ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {e.up ? '↑' : ''} {e.trend}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== タブ定義 =====
type TabKey = 'market' | 'my-jobs' | 'earnings';
const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: 'market', label: 'コンピュートを借りる', desc: '需要者向け：ノード検索・ジョブ発注' },
  { key: 'my-jobs', label: 'マイジョブ', desc: '送信済みジョブの状態確認' },
  { key: 'earnings', label: '収益ダッシュボード', desc: '店舗オペレーター向け収益レポート' },
];

// ===== ページコンポーネント =====
export default function ComputePage() {
  const {
    filteredNodes,
    myJobs,
    isLoading: loading,
    error,
    taskFilter,
    availableOnly,
    bookingNode,
    submitting,
    submitSuccess,
    activeTab,
    setActiveTab,
    refresh,
    openBooking,
    closeBooking,
    setTaskFilter,
    setAvailableOnly,
    submitJob,
  } = useComputePage();
  const { transferJpyc, isTransferring, isConfirming } = useJPYCTransfer();

  const handleSubmitJob = async (hours: number, taskType: TaskType) => {
    if (!bookingNode) return;
    try {
      const computeRight = CONTRACT_ADDRESSES.computeRight as `0x${string}`;
      if (!computeRight || !computeRight.startsWith('0x')) {
        throw new Error('NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS が未設定です');
      }

      const totalMinor = bookingNode.pricePerHourMinor * hours;
      const totalJpyc = (totalMinor / 100).toFixed(2);
      const paymentTxHash = await transferJpyc(computeRight, totalJpyc);

      await submitJob({
        nodeId: bookingNode.nodeId,
        estimatedHours: hours,
        taskType,
        paymentTxHash,
      });
    } catch {
      // エラー文言は compute.store 側に保存され、画面バナーで表示される
    }
  };

  return (
    <>
      {/* ===== ページヘッダー（ダーク背景） ===== */}
      <div
        className="pt-24 pb-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #0F172A 100%)' }}
      >
        {/* 背景グロー */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 30% 50%, rgba(99,102,241,0.4) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 70% 50%, rgba(245,158,11,0.2) 0%, transparent 70%)',
          }}
        />
        <div className="container-main relative z-10">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">コンピュートマーケット</span>
          </nav>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              {/* ラベル */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-500/10 border border-brand-500/20 rounded-full text-brand-300 text-sm font-semibold mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                遊休コンピュート × JPYC 収益化
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
                コンピュートマーケット
              </h1>
              <p className="text-slate-400 text-lg max-w-lg">
                ネットカフェの遊休PCをAI学習・3DCGレンダリング・ZK証明生成などに活用。
                店舗はJPYCで追加収益を得られます。
              </p>
            </div>

            {/* 店舗オペレーター向けCTA */}
            <Link
              href="/merchant/compute"
              className="inline-flex items-center gap-2 px-5 py-3 bg-jpyc-500/10 border border-jpyc-500/30 text-jpyc-300 hover:bg-jpyc-500/20 rounded-xl text-sm font-semibold transition-colors"
            >
              <span>🏪</span>
              ノードを提供する（店舗向け）
            </Link>
          </div>
        </div>
      </div>

      {/* ===== メインコンテンツ ===== */}
      <div className="container-main py-8">
        {/* ジョブ送信成功バナー */}
        {submitSuccess && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 animate-fade-in">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="2 6 5 10 11 3" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-emerald-800">ジョブを送信しました！</p>
              <p className="text-sm text-emerald-600">マイジョブタブでステータスを確認できます。</p>
            </div>
            <button
              onClick={() => setActiveTab('my-jobs')}
              className="ml-auto btn-primary py-1.5 px-4 text-sm flex-shrink-0"
            >
              マイジョブへ
            </button>
          </div>
        )}

        {/* タブナビゲーション */}
        <div className="flex overflow-x-auto gap-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit max-w-full">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== タブ：コンピュートを借りる ===== */}
        {activeTab === 'market' && (
          <>
            {/* 統計バナー */}
            <StatsBanner nodes={filteredNodes} myJobs={myJobs} />

            {/* フィルターバー */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {/* タスク種別フィルター */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTaskFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    taskFilter === 'ALL'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  すべて
                </button>
                {(Object.entries(TASK_TYPE_CONFIG) as [TaskType, typeof TASK_TYPE_CONFIG[TaskType]][]).map(
                  ([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setTaskFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                        taskFilter === key
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  )
                )}
              </div>

              {/* 空き状況トグル */}
              <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-600"
                />
                <span className="text-sm text-slate-600 font-medium">空きのみ表示</span>
              </label>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3">
                <span className="text-red-700 text-sm">{error}</span>
                <button onClick={refresh} className="btn-secondary py-1.5 px-3 text-sm">再試行</button>
              </div>
            )}

            <p className="text-sm text-slate-500 mb-4">
              <span className="font-semibold text-slate-800">{filteredNodes.length}台</span>のノードが見つかりました
            </p>

            {/* ノードグリッド */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card p-5 flex flex-col gap-4">
                    <div className="skeleton h-5 w-3/4 rounded" />
                    <div className="skeleton h-20 w-full rounded-xl" />
                    <div className="skeleton h-16 w-full rounded" />
                    <div className="skeleton h-10 w-1/2 rounded mt-auto" />
                  </div>
                ))}
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="card p-16 text-center">
                <div className="text-5xl mb-4">🖥️</div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">条件に一致するノードがありません</h3>
                <p className="text-slate-400 text-sm">フィルターを変更してお試しください</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredNodes.map((node) => (
                  <NodeCard key={node.nodeId} node={node} onBook={(node) => openBooking(node.nodeId)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== タブ：マイジョブ ===== */}
        {activeTab === 'my-jobs' && (
          <div className="card overflow-hidden max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-50">
              <h2 className="text-base font-bold text-slate-800">送信済みジョブ一覧</h2>
            </div>
            <div className="px-6 py-2 divide-y divide-slate-50">
              {myJobs.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-5xl mb-4">📋</div>
                  <p className="text-slate-400">まだジョブを送信していません</p>
                </div>
              ) : (
                myJobs.map((job) => <JobRow key={job.jobId} job={job} />)
              )}
            </div>

            {/* ジョブ送信CTAボタン */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setActiveTab('market')}
                className="btn-primary text-sm py-2.5"
              >
                新しいジョブを送信する
              </button>
            </div>
          </div>
        )}

        {/* ===== タブ：収益ダッシュボード ===== */}
        {activeTab === 'earnings' && (
          <div className="max-w-4xl">
            <EarningsSummary nodes={filteredNodes} myJobs={myJobs} />

            {/* 収益分配説明 */}
            <div className="card p-6 mb-6">
              <h3 className="text-base font-bold text-slate-800 mb-4">収益分配ルール</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    role: 'ネットカフェ店舗',
                    rate: '75%',
                    desc: 'ハードウェア・電力提供への報酬',
                    color: 'bg-jpyc-50 border-jpyc-100',
                    text: 'text-jpyc-700',
                  },
                  {
                    role: 'プラットフォーム',
                    rate: '25%',
                    desc: 'スケジューリング・決済・サポート',
                    color: 'bg-brand-50 border-brand-100',
                    text: 'text-brand-700',
                  },
                  {
                    role: '決済コスト',
                    rate: '実費',
                    desc: 'Gas・流動性・換金（透明開示）',
                    color: 'bg-slate-50 border-slate-100',
                    text: 'text-slate-600',
                  },
                ].map((item) => (
                  <div
                    key={item.role}
                    className={`${item.color} border rounded-xl p-4 text-center`}
                  >
                    <div className={`text-3xl font-extrabold ${item.text} mb-1`}>{item.rate}</div>
                    <div className="font-semibold text-slate-800 text-sm mb-1">{item.role}</div>
                    <div className="text-xs text-slate-500">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* タスク中断ルール */}
            <div className="card p-6">
              <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span>⚡</span> タスク中断・失敗時の処理
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  {
                    trigger: 'ユーザーが着席（座席利用優先）',
                    action: '別ノードへ自動マイグレーション。完了分は比例配分で精算。',
                    icon: '🧑‍💻',
                  },
                  {
                    trigger: 'ハードウェア障害',
                    action: '需要者へ全額返金。店舗への収益なし。',
                    icon: '🔧',
                  },
                  {
                    trigger: '需要者がキャンセル',
                    action: '実行時間に応じた比例課金。残額は返金。',
                    icon: '❌',
                  },
                ].map((rule) => (
                  <div
                    key={rule.trigger}
                    className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl"
                  >
                    <span className="text-xl flex-shrink-0">{rule.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{rule.trigger}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{rule.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== ジョブ送信モーダル ===== */}
      {bookingNode && (
        <JobSubmitModal
          node={bookingNode}
          onClose={closeBooking}
          onSubmit={handleSubmitJob}
          submitting={submitting || isTransferring || isConfirming}
        />
      )}
    </>
  );
}
