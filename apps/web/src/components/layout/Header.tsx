'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLoginFlow } from '../../hooks/useLoginFlow';
import { useNavState } from '../../hooks/useNavState';
import { useSyncState } from '../../hooks/useSyncState';
import { useUiState } from '../../hooks/useUiState';
import { useUserState } from '../../hooks/useUserState';

const NAV_ITEMS = [
  { href: '/', label: 'ホーム' },
  { href: '/venues', label: '会場を探す' },
  { href: '/explore', label: 'マップ' },
  { href: '/marketplace', label: 'マーケット' },
  { href: '/usage-rights', label: '利用権' },
  { href: '/sessions', label: 'セッション' },
  { href: '/compute', label: 'コンピュート' },
  { href: '/revenue', label: '収益' },
] as const;

async function copyToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard unsupported');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('copy failed');
}

export function Header() {
  const {
    mobileOpen,
    scrolled,
    loginModalOpen,
    closeMobile,
    toggleMobile,
    openLoginModal,
    closeLoginModal,
  } = useUiState();
  const { balance, walletAddress, isAuthenticated, loginMethod, walletLabel } = useUserState();
  const { chainSyncStatus, chainSyncLastError } = useSyncState();
  const { isNavItemActive } = useNavState();
  const {
    socialHint,
    pendingWalletSignIn,
    socialSigning,
    isAuthenticating,
    connecting,
    signing,
    authError,
    connectErrorMessage,
    walletActionLabel,
    clearMessages,
    handleWalletLogin,
    handleSocialLogin,
    handleLogout,
  } = useLoginFlow({ walletAddress, isAuthenticated, loginMethod, onCloseModal: closeLoginModal });

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const handleCopyWallet = async () => {
    if (!walletAddress) return;
    try {
      await copyToClipboard(walletAddress);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const handleOpenModal = () => {
    clearMessages();
    openLoginModal();
  };

  const handleCloseModal = () => {
    clearMessages();
    closeLoginModal();
  };

  const authMethodLabel =
    loginMethod === 'social'
      ? 'ソーシャル認証'
      : loginMethod === 'wallet'
        ? 'ウォレット認証'
        : isAuthenticated
          ? '認証済み'
          : '未認証';

  const copyLabel = copyStatus === 'copied' ? 'コピー済み' : copyStatus === 'failed' ? '失敗' : 'コピー';

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm' : 'bg-transparent'
        }`}
      >
        <div className="container-main">
          <div className="h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={closeMobile}>
              <div className="w-8 h-8 bg-linear-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="5" cy="19" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <line x1="12" y1="7" x2="12" y2="12" />
                  <line x1="12" y1="12" x2="5.5" y2="17.5" />
                  <line x1="12" y1="12" x2="18.5" y2="17.5" />
                </svg>
              </div>
              <span className={`font-bold text-lg tracking-tight ${scrolled ? 'text-slate-900' : 'text-white'}`}>
                Node Stay
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => {
                const active = isNavItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap [word-break:keep-all] leading-none shrink-0 transition-colors ${
                      active
                        ? scrolled
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-white/10 text-white'
                        : scrolled
                          ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          : 'text-white/85 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {chainSyncStatus?.isSyncing && (
                <span
                  className={`hidden 2xl:flex items-center gap-1.5 text-xs px-2 py-1 rounded-md whitespace-nowrap ${
                    scrolled ? 'text-sky-700 bg-sky-50' : 'text-sky-200 bg-white/10'
                  }`}
                  title="チェーン同期中"
                >
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  同期中
                </span>
              )}

              {chainSyncStatus && !chainSyncStatus.isSyncing && !chainSyncLastError && (
                <span
                  className={`hidden 2xl:inline-flex text-xs px-2 py-1 rounded-md whitespace-nowrap ${
                    scrolled ? 'text-slate-500 bg-slate-50' : 'text-white/60 bg-white/5'
                  }`}
                  title={`Block #${chainSyncStatus.lastProcessedBlock}`}
                >
                  同期OK
                </span>
              )}

              {chainSyncLastError && (
                <span
                  className={`text-xs px-2 py-1 rounded-md whitespace-nowrap max-w-[120px] truncate ${
                    scrolled ? 'text-rose-700 bg-rose-50' : 'text-rose-200 bg-white/10'
                  }`}
                  title={chainSyncLastError}
                >
                  同期エラー
                </span>
              )}

              {walletAddress && (
                <button
                  onClick={handleCopyWallet}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
                    scrolled ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                  title={`ウォレットアドレスをコピー: ${walletAddress}`}
                >
                  {walletLabel}
                </button>
              )}

              {isAuthenticated && balance !== null && (
                <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${scrolled ? 'bg-jpyc-50 text-jpyc-700' : 'bg-white/10 text-white'}`}>
                  {(balance / 100).toLocaleString('ja-JP')} JPYC
                </div>
              )}

              <button
                onClick={handleOpenModal}
                className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                title={isAuthenticated ? 'アカウント' : 'ログイン'}
              >
                {isAuthenticated ? 'アカウント' : 'ログイン'}
              </button>

              {isAuthenticated && (
                <button
                  onClick={() => void handleLogout()}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    scrolled ? 'text-slate-600 hover:bg-slate-100' : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  ログアウト
                </button>
              )}
            </div>

            <div className="lg:hidden ml-auto flex items-center gap-2">
              <button
                onClick={handleOpenModal}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                {isAuthenticated ? 'アカウント' : 'ログイン'}
              </button>
              <button
                className={`p-2 rounded-lg ${scrolled ? 'text-slate-600 hover:bg-slate-100' : 'text-white hover:bg-white/10'}`}
                onClick={toggleMobile}
                aria-label="メニューを開く"
              >
                {mobileOpen ? (
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="4" x2="18" y2="18" />
                    <line x1="18" y1="4" x2="4" y2="18" />
                  </svg>
                ) : (
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="19" y2="6" />
                    <line x1="3" y1="12" x2="19" y2="12" />
                    <line x1="3" y1="18" x2="19" y2="18" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden bg-white border-b border-slate-100 shadow-lg">
            <div className="container-main py-4 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">ウォレット</span>
                  <span className="text-xs font-semibold text-slate-900">{walletLabel}</span>
                </div>
                {walletAddress && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-600 truncate">{walletAddress}</p>
                    <button
                      onClick={handleCopyWallet}
                      className="text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-700"
                    >
                      {copyLabel}
                    </button>
                  </div>
                )}
                {walletAddress && <p className="text-[11px] text-slate-500">認証方式: {authMethodLabel}</p>}
              </div>

              {isAuthenticated && balance !== null && (
                <div className="px-3 py-2 rounded-lg text-sm font-semibold bg-jpyc-50 text-jpyc-700">
                  残高: {(balance / 100).toLocaleString('ja-JP')} JPYC
                </div>
              )}

              {isAuthenticated && (
                <button
                  onClick={() => void handleLogout()}
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  ログアウト
                </button>
              )}

              {authError && <p className="text-xs text-red-500 px-1">{authError}</p>}

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isNavItemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      className={`px-4 py-3 rounded-xl text-sm font-medium ${
                        active ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      {loginModalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-label="ログイン方法を選択"
        >
          <div
            className="mx-auto mt-16 w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">ログイン方法を選択</h2>
                <p className="text-sm text-slate-500 mt-1">ウォレットまたはソーシャルアカウントでログインできます。</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            {isAuthenticated && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <p>現在ログイン済みです（{authMethodLabel}）。</p>
                <button
                  onClick={() => void handleLogout()}
                  className="mt-3 inline-flex rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  ログアウト
                </button>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="min-h-[320px] rounded-2xl border border-slate-200 p-5 bg-slate-50/50 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center font-bold">S</div>
                  <h3 className="text-lg font-bold text-slate-900">ソーシャルログイン</h3>
                </div>
                <p className="text-sm text-slate-600 leading-6">
                  Google / X / Email でログインし、スマートウォレットを使った購入フローを利用します。
                </p>
                <button
                  onClick={() => void handleSocialLogin()}
                  disabled={socialSigning || signing || isAuthenticating || isAuthenticated}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-auto"
                >
                  {socialSigning ? '認証画面を起動中...' : 'ソーシャルでログイン'}
                </button>
              </section>

              <section className="min-h-[320px] rounded-2xl border border-slate-200 p-5 bg-orange-50/40 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-orange-100 text-orange-700 grid place-items-center font-bold">W</div>
                  <h3 className="text-lg font-bold text-slate-900">ウォレットログイン</h3>
                </div>
                <p className="text-sm text-slate-600 leading-6">
                  MetaMask などのウォレットを接続し、署名でログインします。
                </p>
                <p className="text-xs text-slate-500 mt-2">現在: {walletLabel}</p>
                {walletAddress && (
                  <div className="mt-2 mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[11px] text-slate-500 mb-1">ウォレットアドレス</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-700 truncate">{walletAddress}</p>
                      <button onClick={handleCopyWallet} className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-700">
                        {copyLabel}
                      </button>
                    </div>
                  </div>
                )}
                {loginMethod === 'social' && isAuthenticated && (
                  <p className="text-xs text-amber-700 mb-3">現在はソーシャル認証中です。追加のウォレット認証は不要です。</p>
                )}
                <button
                  onClick={() => void handleWalletLogin()}
                  disabled={connecting || signing || isAuthenticating || isAuthenticated || pendingWalletSignIn}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-auto"
                >
                  {walletActionLabel}
                </button>
              </section>
            </div>

            {(socialHint || authError || connectErrorMessage) && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
                {socialHint && <p className="text-xs text-slate-600">{socialHint}</p>}
                {authError && <p className="text-xs text-red-600">{authError}</p>}
                {connectErrorMessage && <p className="text-xs text-red-600">{connectErrorMessage}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
