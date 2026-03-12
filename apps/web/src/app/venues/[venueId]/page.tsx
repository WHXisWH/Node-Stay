'use client';

// 店舗詳細ページ（View 層：useVenueDetailPage の戻り値を表示のみ、SPEC V2）

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useVenueDetailPage } from '../../../hooks';
import type { PlanListItem } from '../../../models/venue.model';

// ===== 時間フォーマットユーティリティ =====
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`;
}

// ===== JPYCフォーマットユーティリティ =====
function formatJPYC(minor: number): string {
  return (minor / 100).toLocaleString('ja-JP');
}

// ===== 料金プランカードコンポーネント =====
function PlanCard({
  plan,
  isPopular,
  onSelect,
}: {
  plan: PlanListItem;
  isPopular?: boolean;
  onSelect: (plan: PlanListItem) => void;
}) {
  return (
    <div
      className={`relative card p-6 flex flex-col gap-4 transition-all duration-200 ${
        isPopular
          ? 'ring-2 ring-brand-500 shadow-glow'
          : 'hover:shadow-card-hover'
      }`}
    >
      {/* 人気バッジ */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-600 text-white text-xs font-bold rounded-full shadow-sm">
            ⭐ 人気プラン
          </span>
        </div>
      )}

      {/* プラン名・時間 */}
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">{plan.name}</h3>
        <div className="flex items-center gap-1.5">
          {/* 時計アイコン */}
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-sm text-slate-500">{formatDuration(plan.baseDurationMinutes)}</span>
        </div>
      </div>

      {/* 価格 */}
      <div className="py-3 border-y border-slate-50">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-slate-900">
            {formatJPYC(plan.basePriceMinor)}
          </span>
          <span className="text-sm font-semibold text-jpyc-500">JPYC</span>
        </div>
        <span className="text-xs text-slate-400">税込</span>
      </div>

      {/* デポジット情報 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">デポジット</span>
        <span className="font-semibold text-slate-700">
          {formatJPYC(plan.depositRequiredMinor)} JPYC
        </span>
      </div>

      {/* 時間単価 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">時間単価</span>
        <span className="font-semibold text-slate-700">
          {formatJPYC(Math.round(plan.basePriceMinor / (plan.baseDurationMinutes / 60)))} JPYC/時間
        </span>
      </div>

      {/* 特典リスト */}
      <ul className="flex flex-col gap-2">
        {['超過自動精算', 'QRチェックイン', 'デポジット自動解除'].map((feat) => (
          <li key={feat} className="flex items-center gap-2 text-sm text-slate-600">
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="#6366F1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 12 8 16 20 8" />
            </svg>
            {feat}
          </li>
        ))}
      </ul>

      {/* 購入ボタン */}
      <button
        onClick={() => onSelect(plan)}
        className={`w-full mt-auto ${isPopular ? 'btn-primary' : 'btn-secondary'}`}
      >
        このプランを選ぶ
      </button>
    </div>
  );
}

// ===== 購入確認モーダルコンポーネント =====
function PurchaseModal({
  plan,
  venueName,
  onClose,
  onConfirm,
  purchasing,
  approving,
  needsApproval,
}: {
  plan: PlanListItem;
  venueName: string;
  onClose: () => void;
  onConfirm: () => void;
  purchasing: boolean;
  approving: boolean;
  needsApproval: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">購入確認</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="4" x2="18" y2="18" />
              <line x1="18" y1="4" x2="4" y2="18" />
            </svg>
          </button>
        </div>

        {/* 購入内容 */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">店舗</span>
            <span className="font-semibold text-slate-800">{venueName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">プラン</span>
            <span className="font-semibold text-slate-800">{plan.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">利用時間</span>
            <span className="font-semibold text-slate-800">{formatDuration(plan.baseDurationMinutes)}</span>
          </div>
          <div className="border-t border-slate-200 pt-3 flex justify-between">
            <span className="text-slate-500 text-sm">基本料金</span>
            <span className="font-bold text-slate-800">{formatJPYC(plan.basePriceMinor)} JPYC</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>デポジット（チェックアウト時返金）</span>
            <span>{formatJPYC(plan.depositRequiredMinor)} JPYC</span>
          </div>
          <div className="bg-brand-50 rounded-lg p-3 flex justify-between items-center">
            <span className="font-bold text-slate-800">合計（凍結額）</span>
            <span className="text-xl font-extrabold text-brand-700">
              {formatJPYC(plan.basePriceMinor + plan.depositRequiredMinor)} JPYC
            </span>
          </div>
        </div>

        {/* 注記 */}
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          ※ デポジットはチェックアウト時に実費精算後、差額が自動返金されます。
          超過料金は最安パックへ自動アップグレードされます。
        </p>

        {/* ボタン群 */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={purchasing}>
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={purchasing}
            className="btn-primary flex-1"
          >
            {approving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                承認中...
              </span>
            ) : purchasing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                処理中...
              </span>
            ) : (
              needsApproval ? '承認して購入する' : 'JPYC で購入する'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function VenueDetailPage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId as string | undefined;

  const {
    venue,
    plans,
    loading,
    error,
    refresh,
    selectedPlan,
    setSelectedPlan,
    purchasing,
    approving,
    purchaseError,
    needsApproval,
    purchaseSuccess,
    handlePurchase,
  } = useVenueDetailPage(venueId);

  // ローディング中
  if (loading) {
    return (
      <div className="pt-20 min-h-screen">
        <div className="bg-surface-900 py-12">
          <div className="container-main">
            <div className="skeleton h-4 w-32 rounded mb-6" style={{ opacity: 0.2 }} />
            <div className="skeleton h-10 w-64 rounded-xl mb-3" style={{ opacity: 0.15 }} />
            <div className="skeleton h-5 w-48 rounded" style={{ opacity: 0.1 }} />
          </div>
        </div>
        <div className="container-main py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-6 flex flex-col gap-4">
                <div className="skeleton h-5 w-3/4 rounded" />
                <div className="skeleton h-10 w-1/2 rounded-xl" />
                <div className="skeleton h-px w-full" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="skeleton h-4 w-full rounded" />
                ))}
                <div className="skeleton h-11 w-full rounded-xl mt-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // エラー時
  if (error) {
    return (
      <div className="pt-32 min-h-screen flex flex-col items-center justify-center text-center p-4">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">データの取得に失敗しました</h2>
        <p className="text-slate-400 text-sm mb-6">ネットワーク接続を確認の上、再試行してください</p>
        <button onClick={refresh} className="btn-primary">
          再試行
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ページヘッダー（ダーク背景） */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/venues" className="hover:text-slate-300 transition-colors">店舗一覧</Link>
            <span>/</span>
            <span className="text-slate-300">{venue?.name ?? venueId}</span>
          </nav>

          {/* 店舗名・住所 */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-extrabold text-white">
                  {venue?.name ?? '店舗詳細'}
                </h1>
                <span className="badge-green">空席あり</span>
              </div>
              {venue && (
                <p className="text-slate-400 flex items-center gap-1.5">
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {venue.address}
                </p>
              )}
            </div>
            {/* 戻るボタン */}
            <Link
              href="/venues"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              店舗一覧へ
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-10">
        {/* 購入成功バナー */}
        {purchaseSuccess && (
          <div className="mb-8 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="2 6 5 10 11 3" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-emerald-800">購入が完了しました！</p>
              <p className="text-sm text-emerald-600 mt-0.5">
                マイ利用権に追加されました。QRコードでチェックインできます。
              </p>
            </div>
            <Link href="/usage-rights" className="ml-auto btn-primary py-1.5 px-4 text-sm flex-shrink-0">
              マイ利用権を見る
            </Link>
          </div>
        )}

        {purchaseError && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs">!</div>
            <div>
              <p className="font-semibold text-red-800">購入処理に失敗しました</p>
              <p className="text-sm text-red-700 mt-0.5 break-all">{purchaseError}</p>
            </div>
          </div>
        )}

        {/* 料金プランセクション */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-6">料金プランを選ぶ</h2>

          {plans.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-500">現在利用可能なプランがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan, index) => (
                <PlanCard
                  key={plan.productId}
                  plan={plan}
                  isPopular={index === 1} // 2番目のプランを人気として表示
                  onSelect={setSelectedPlan}
                />
              ))}
            </div>
          )}
        </div>

        {/* 注意事項 */}
        <div className="card p-6 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="#64748B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            ご利用にあたって
          </h3>
          <ul className="flex flex-col gap-2">
            {[
              'チェックイン時に本人確認が必要な場合があります',
              '超過料金は最安パックへ自動アップグレードされます（上限：元料金×1.5倍）',
              'デポジットはチェックアウト後、差額が自動返金されます',
              '深夜利用・未成年利用は各店舗の規定に従います',
            ].map((note) => (
              <li key={note} className="text-sm text-slate-500 flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 購入確認モーダル */}
      {selectedPlan && venue && (
        <PurchaseModal
          plan={selectedPlan}
          venueName={venue.name}
          onClose={() => setSelectedPlan(null)}
          onConfirm={handlePurchase}
          purchasing={purchasing}
          approving={approving}
          needsApproval={needsApproval}
        />
      )}
    </>
  );
}
