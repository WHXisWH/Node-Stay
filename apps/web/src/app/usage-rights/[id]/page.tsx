'use client';

// 利用権詳細ページ（View 層：useUsageRightDetail の戻り値を表示のみ）

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUsageRightDetail } from '../../../hooks';
import type { UsageRightDetail } from '../../../hooks/useUsageRightDetail';
import type { UsageRightStatus } from '../../../hooks/usePassesPage';
import { CheckinQrCode } from '../../../components/CheckinQrCode';
import { CHAIN_CONFIG } from '../../../services/config';

// ===== ステータス設定 =====
const STATUS_CONFIG: Record<UsageRightStatus, { label: string; dotColor: string; badgeClass: string }> = {
  ACTIVE:      { label: '有効',      dotColor: 'bg-emerald-400', badgeClass: 'badge-green' },
  IN_USE:      { label: '利用中',    dotColor: 'bg-blue-400',    badgeClass: 'bg-blue-100 text-blue-700 badge' },
  LISTED:      { label: '出品中',    dotColor: 'bg-purple-400',  badgeClass: 'bg-purple-100 text-purple-700 badge' },
  CONSUMED:    { label: '使用済み',  dotColor: 'bg-slate-300',   badgeClass: 'badge-gray' },
  EXPIRED:     { label: '期限切れ',  dotColor: 'bg-red-400',     badgeClass: 'badge-red' },
  TRANSFERRED: { label: '譲渡済み',  dotColor: 'bg-slate-300',   badgeClass: 'badge-gray' },
  PENDING:     { label: '処理中',    dotColor: 'bg-amber-400',   badgeClass: 'badge-yellow' },
};

// ===== ユーティリティ =====
function formatJPYC(minor: number) {
  const value = Number.isFinite(minor) ? minor : 0;
  return (value / 100).toLocaleString('ja-JP');
}

function formatDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRemainingTime(minutes: number) {
  if (minutes <= 0) return '0分';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function shortTxHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function explorerTxUrl(hash: string) {
  return `${CHAIN_CONFIG.blockExplorerUrl.replace(/\/+$/, '')}/tx/${hash}`;
}

// ===== QR コードモーダル =====
function QrModal({ right, onClose }: { right: UsageRightDetail; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900">チェックイン用 QR コード</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        <div className="w-52 h-52 mx-auto mb-5 flex items-center justify-center">
          <CheckinQrCode
            usageRightId={right.usageRightId}
            venueId={right.venueId || right.usageRightId}
            size={208}
          />
        </div>

        {/* 利用権情報 */}
        <div className="mb-2">
          <p className="text-sm font-bold text-slate-900">{right.planName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{right.venueName}</p>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500 mb-5">
          <span>残り {formatRemainingTime(right.remainingMinutes)}</span>
          {right.onchainTokenId && <span>Token #{right.onchainTokenId}</span>}
        </div>

        <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 leading-relaxed">
          スタッフまたはキオスクのスキャナーに提示してください
        </p>
      </div>
    </div>
  );
}

// ===== 譲渡モーダル =====
function TransferModal({
  right,
  input,
  onChangeInput,
  onSubmit,
  onClose,
  transferring,
  error,
}: {
  right: UsageRightDetail;
  input: { toWalletAddress: string };
  onChangeInput: (v: { toWalletAddress: string }) => void;
  onSubmit: () => void;
  onClose: () => void;
  transferring: boolean;
  error: string | null;
}) {
  const daysLeft = right.transferCutoff
    ? Math.ceil((new Date(right.transferCutoff).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-slate-900">利用権を譲渡する</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        {/* 注意書き */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-700 leading-relaxed">
          <p className="font-semibold mb-1">譲渡に関する注意事項</p>
          <ul className="list-disc list-inside flex flex-col gap-1 text-xs">
            <li>譲渡は一度のみ可能です（残り{right.maxTransferCount - right.transferCount}回）</li>
            {daysLeft !== null && <li>譲渡期限：{daysLeft}日後まで</li>}
            <li>譲渡後、元の所有権は消滅します</li>
            <li>デポジットは譲渡先に引き継がれます</li>
          </ul>
        </div>

        {/* フォーム */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            譲渡先ウォレットアドレス <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={input.toWalletAddress}
            onChange={(e) => onChangeInput({ toWalletAddress: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={transferring} className="btn-secondary flex-1 py-2.5">
            キャンセル
          </button>
          <button onClick={onSubmit} disabled={transferring} className="btn-primary flex-1 py-2.5">
            {transferring ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                譲渡中...
              </span>
            ) : '譲渡を実行する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 詳細情報行 =====
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-400 flex-shrink-0 w-32">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{children}</span>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function UsageRightDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as string | undefined;
  const router = useRouter();
  const searchParams = useSearchParams();
  const transferModalRequested = searchParams.get('modal') === 'transfer';

  const {
    right,
    notFound,
    loading,
    showQr, setShowQr,
    showTransfer, setShowTransfer,
    transferInput, setTransferInput,
    transferring, transferError, transferSuccess, transferTxHash,
    handleTransfer,
    cancelling, cancelError, cancelSuccess,
    handleCancel,
  } = useUsageRightDetail(id);

  const canTransferByState = !!right
    && right.status === 'ACTIVE'
    && right.transferable
    && right.transferCount < right.maxTransferCount
    && (!right.transferCutoff || Date.now() < new Date(right.transferCutoff).getTime());

  useEffect(() => {
    if (transferModalRequested && canTransferByState) {
      setShowTransfer(true);
    }
  }, [transferModalRequested, canTransferByState, setShowTransfer]);

  const closeTransferModal = () => {
    setShowTransfer(false);
    if (transferModalRequested && id) {
      router.replace(`/usage-rights/${id}`, { scroll: false });
    }
  };

  // ローディング
  if (loading) {
    return (
      <div className="pt-32 flex items-center justify-center min-h-screen">
        <span className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  // 404
  if (notFound || !right) {
    return (
      <div className="pt-32 min-h-screen flex flex-col items-center justify-center text-center p-4">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">利用権が見つかりません</h2>
        <p className="text-slate-400 text-sm mb-6">指定された利用権は存在しないか、アクセス権限がありません</p>
        <Link href="/usage-rights" className="btn-primary">マイ利用権に戻る</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[right.status];
  const isActive = right.status === 'ACTIVE';
  const transferCutoffMs = right.transferCutoff ? new Date(right.transferCutoff).getTime() : null;
  const isTransferCutoffPassed = transferCutoffMs != null && Number.isFinite(transferCutoffMs) && Date.now() >= transferCutoffMs;
  const canTransfer = isActive
    && right.transferable
    && right.transferCount < right.maxTransferCount
    && !isTransferCutoffPassed;
  const transferDisabledReason =
    !right.transferable
      ? 'この利用権は譲渡不可です'
      : right.transferCount >= right.maxTransferCount
        ? '最大譲渡回数に達しています'
        : isTransferCutoffPassed
          ? '譲渡期限を過ぎています'
          : null;
  const canCancel = right.status === 'ACTIVE' || right.status === 'PENDING';
  const isFinished = right.status === 'CONSUMED' || right.status === 'EXPIRED' || right.status === 'TRANSFERRED';
  const expiresAtMs = new Date(right.expiresAt).getTime();
  const isExpiredByDate = Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
  const progressPercent = right.planDurationMinutes > 0
    ? Math.min(100, (right.remainingMinutes / right.planDurationMinutes) * 100)
    : 0;

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          {/* パンくずリスト */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/usage-rights" className="hover:text-slate-300 transition-colors">マイ利用権</Link>
            <span>/</span>
            <span className="text-slate-300">{right.planName}</span>
          </nav>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {/* ステータス */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`${statusCfg.badgeClass} flex items-center gap-1.5`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
                  {statusCfg.label}
                </span>
                {right.onchainTokenId && (
                  <span className="text-xs text-slate-400 font-mono">Token #{right.onchainTokenId}</span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold text-white mb-1">{right.planName}</h1>
              <p className="text-slate-400 flex items-center gap-1.5">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <Link href={`/venues/${right.venueId}`} className="hover:text-slate-200 transition-colors">
                  {right.venueName}
                </Link>
              </p>
            </div>

            {/* 戻るボタン */}
            <Link href="/usage-rights" className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              一覧に戻る
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 左カラム：アクション + QR */}
          <div className="flex flex-col gap-4">

            {/* 譲渡成功バナー */}
            {transferSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="4 12 8 16 20 8" />
                </svg>
                <div className="flex flex-col gap-1">
                  <span>譲渡が完了しました</span>
                  {transferTxHash && (
                    <a
                      href={explorerTxUrl(transferTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-700 underline font-semibold"
                    >
                      取引詳細を確認する
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* キャンセル成功バナー */}
            {cancelSuccess && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 flex items-center gap-2">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="4 12 8 16 20 8" />
                </svg>
                利用権をキャンセルしました
              </div>
            )}

            {/* QR チェックインカード */}
            {(isActive || right.status === 'IN_USE') && (
              <div className="card p-5 text-center">
                <div className="w-36 h-36 mx-auto mb-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
                  <svg width="36" height="36" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="10" height="10" /><rect x="17" y="3" width="10" height="10" />
                    <rect x="3" y="17" width="10" height="10" /><rect x="19" y="19" width="3" height="3" />
                    <rect x="23" y="19" width="3" height="3" /><rect x="19" y="23" width="3" height="3" />
                    <rect x="23" y="23" width="3" height="3" />
                  </svg>
                  <span className="text-xs text-slate-400">QR</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">スキャナーに提示してチェックインできます</p>
                <button
                  onClick={() => setShowQr(true)}
                  className="btn-primary w-full py-2.5"
                >
                  QR コードを表示
                </button>
              </div>
            )}

            {/* アクションボタン */}
            <div className="card p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">アクション</p>

              {/* 譲渡ボタン */}
              {canTransfer && !transferSuccess && (
                <button
                  onClick={() => setShowTransfer(true)}
                  className="btn-secondary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12H19" /><path d="M12 5l7 7-7 7" />
                  </svg>
                  利用権を譲渡する
                </button>
              )}
              {!canTransfer && isActive && transferDisabledReason && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {transferDisabledReason}
                </p>
              )}

              {/* キャンセルボタン */}
              {canCancel && !cancelSuccess && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full py-2.5 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 transition-colors"
                >
                  {cancelling ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                      キャンセル中...
                    </span>
                  ) : '利用権をキャンセルする'}
                </button>
              )}
              {cancelError && <p className="text-xs text-red-500">{cancelError}</p>}

              {/* セッションへのリンク */}
              {right.status === 'IN_USE' && (
                <Link href="/sessions" className="btn-primary w-full text-center py-2.5 text-sm">
                  現在のセッションを見る
                </Link>
              )}

              {/* 使い終わった場合のアクション */}
              {isFinished && (
                <Link href="/venues" className="btn-secondary w-full text-center py-2.5 text-sm">
                  新しい利用権を購入する
                </Link>
              )}
            </div>

            {/* 残り時間ゲージ */}
            {(isActive || right.status === 'IN_USE') && (
              <div className="card p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">残り利用時間</p>
                <p className="text-2xl font-extrabold text-slate-900 mb-3">
                  {formatRemainingTime(right.remainingMinutes)}
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  基本時間 {formatRemainingTime(right.planDurationMinutes)}
                </p>
              </div>
            )}
          </div>

          {/* 右カラム：詳細情報 */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* 基本情報 */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">利用権情報</h2>
              <InfoRow label="プラン名">{right.planName}</InfoRow>
              <InfoRow label="利用店舗">
                <Link href={`/venues/${right.venueId}`} className="text-brand-600 hover:text-brand-800 transition-colors">
                  {right.venueName}
                </Link>
              </InfoRow>
              <InfoRow label="店舗住所">{right.venueAddress}</InfoRow>
              <InfoRow label="ステータス">
                <span className={`${statusCfg.badgeClass} inline-flex items-center gap-1`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
                  {statusCfg.label}
                </span>
              </InfoRow>
              <InfoRow label="購入日時">{formatDateTime(right.purchasedAt)}</InfoRow>
              <InfoRow label="有効期限">
                <span className={isExpiredByDate ? 'text-red-500' : ''}>
                  {formatDateTime(right.expiresAt)}
                </span>
              </InfoRow>
              {right.transferCutoff && (
                <InfoRow label="譲渡期限">{formatDateTime(right.transferCutoff)}</InfoRow>
              )}
            </div>

            {/* 料金・デポジット */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">料金・デポジット</h2>
              <InfoRow label="基本料金">{formatJPYC(right.basePriceMinor)} JPYC</InfoRow>
              <InfoRow label="デポジット">
                {right.depositAmountMinor > 0
                  ? `${formatJPYC(right.depositAmountMinor)} JPYC`
                  : '—'}
              </InfoRow>
              <InfoRow label="デポジット状態">
                {right.depositStatus === 'NONE'              && <span className="badge-gray">なし</span>}
                {right.depositStatus === 'HELD'              && <span className="badge-yellow">凍結中</span>}
                {right.depositStatus === 'PARTIALLY_CAPTURED'&& <span className="badge-yellow">一部捕捉</span>}
                {right.depositStatus === 'RELEASED'          && <span className="badge-green">返金済み</span>}
              </InfoRow>
            </div>

            {/* 譲渡情報 */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">譲渡情報</h2>
              <InfoRow label="譲渡可能">
                {right.transferable
                  ? <span className="badge-green">可能</span>
                  : <span className="badge-gray">不可</span>}
              </InfoRow>
              {right.transferable && (
                <InfoRow label="残り譲渡回数">
                  {right.maxTransferCount - right.transferCount} / {right.maxTransferCount} 回
                </InfoRow>
              )}
            </div>

            {/* オンチェーン情報 */}
            <div className="card p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">オンチェーン情報</h2>
              <InfoRow label="トークン ID">
                {right.onchainTokenId ? `#${right.onchainTokenId}` : <span className="text-amber-500 text-xs">未登録（オフチェーン管理）</span>}
              </InfoRow>
              <InfoRow label="トランザクション">
                {right.txHash ? (
                  <span className="font-mono text-xs text-slate-600">{shortTxHash(right.txHash)}</span>
                ) : '—'}
              </InfoRow>
              {right.txHash && (
                <div className="mt-3">
                  <a
                    href={explorerTxUrl(right.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-600 hover:text-brand-800 font-semibold flex items-center gap-1 transition-colors"
                  >
                    取引詳細を確認する
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QR コードモーダル */}
      {showQr && <QrModal right={right} onClose={() => setShowQr(false)} />}

      {/* 譲渡モーダル */}
      {showTransfer && (
        <TransferModal
          right={right}
          input={transferInput}
          onChangeInput={setTransferInput}
          onSubmit={handleTransfer}
          onClose={closeTransferModal}
          transferring={transferring}
          error={transferError}
        />
      )}
    </>
  );
}
