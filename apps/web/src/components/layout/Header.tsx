'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useUserStore } from '../../stores/user.store';
import { useWalletSync } from '../../hooks/useWalletSync';
import { useAuth } from '../../hooks/useAuth';
import { UserService } from '../../services/user.service';
import { Web3AuthService } from '../../services/web3auth.service';

const NAV_ITEMS = [
  { href: '/', label: 'ホーム' },
  { href: '/venues', label: '店舗を探す' },
  { href: '/explore', label: 'マップ' },
  { href: '/marketplace', label: 'マーケット' },
  { href: '/usage-rights', label: '利用権' },
  { href: '/sessions', label: 'セッション' },
  { href: '/compute', label: 'コンピュート' },
  { href: '/revenue', label: '収益' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [socialHint, setSocialHint] = useState<string | null>(null);
  const [pendingWalletSignIn, setPendingWalletSignIn] = useState(false);
  const [socialSigning, setSocialSigning] = useState(false);

  const balance = useUserStore((s) => s.balance?.balanceMinor ?? null);
  const walletAddress = useUserStore((s) => s.walletAddress);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const setWalletAddress = useUserStore((s) => s.setWalletAddress);

  useWalletSync();
  const { address: wagmiAddress } = useAccount();
  const { connectors, connectAsync, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signIn, signInWithCustomSigner, signOut, signing, authError } = useAuth(wagmiAddress ?? null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      UserService.getBalance().catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (loginModalOpen && isAuthenticated) {
      setLoginModalOpen(false);
    }
  }, [loginModalOpen, isAuthenticated]);

  useEffect(() => {
    if (!pendingWalletSignIn || !walletAddress) return;
    setPendingWalletSignIn(false);
    void signIn();
  }, [pendingWalletSignIn, walletAddress, signIn]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const openLoginModal = useCallback(() => {
    setSocialHint(null);
    setLoginModalOpen(true);
    setMobileOpen(false);
  }, []);

  const closeLoginModal = useCallback(() => {
    setLoginModalOpen(false);
    setSocialHint(null);
  }, []);

  const handleWalletLogin = useCallback(async () => {
    if (isAuthenticated) {
      closeLoginModal();
      return;
    }

    if (wagmiAddress) {
      await signIn();
      return;
    }

    const connector =
      connectors.find((c) => c.id === 'metaMask')
      ?? connectors.find((c) => c.id === 'coinbaseWallet')
      ?? connectors.find((c) => c.id === 'injected')
      ?? connectors[0];
    if (!connector) return;

    setPendingWalletSignIn(true);
    try {
      await connectAsync({ connector });
    } catch {
      setPendingWalletSignIn(false);
    }
  }, [closeLoginModal, connectAsync, connectors, isAuthenticated, signIn, wagmiAddress]);

  const handleSocialLogin = useCallback(async () => {
    setSocialHint(null);
    setSocialSigning(true);

    try {
      const social = await Web3AuthService.connectSocial();
      setWalletAddress(social.address);

      await signInWithCustomSigner({
        walletAddress: social.address,
        chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '80002'),
        signMessage: social.signMessage,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ソーシャルログインに失敗しました。';
      setSocialHint(message);
    } finally {
      setSocialSigning(false);
    }
  }, [setWalletAddress, signInWithCustomSigner]);

  const handleLogout = useCallback(async () => {
    signOut();
    disconnect();
    await Web3AuthService.logout().catch(() => {});
    setSocialHint(null);
    setLoginModalOpen(false);
  }, [disconnect, signOut]);

  const walletLabel = useMemo(() => {
    if (!walletAddress) return '未接続';
    return shortAddress(walletAddress);
  }, [walletAddress]);

  const walletActionLabel = useMemo(() => {
    if (connecting || pendingWalletSignIn) return 'ウォレット接続中...';
    if (signing) return '署名中...';
    if (isAuthenticated) return '認証済み';
    if (!walletAddress) return 'ウォレットでログイン';
    return 'ウォレット署名でログイン';
  }, [connecting, isAuthenticated, pendingWalletSignIn, signing, walletAddress]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm'
            : 'bg-transparent'
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
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap [word-break:keep-all] leading-none shrink-0 transition-colors ${
                      active
                        ? scrolled ? 'bg-brand-50 text-brand-700' : 'bg-white/10 text-white'
                        : scrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-50' : 'text-white/85 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {walletAddress && !isAuthenticated && (
                <span className={`text-xs px-2 py-1 rounded-md whitespace-nowrap ${
                  scrolled ? 'text-amber-700 bg-amber-50' : 'text-amber-200 bg-white/10'
                }`}>
                  未認証
                </span>
              )}

              {isAuthenticated && balance !== null && (
                <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
                  scrolled ? 'bg-jpyc-50 text-jpyc-700' : 'bg-white/10 text-white'
                }`}>
                  {(balance / 100).toLocaleString('ja-JP')} JPYC
                </div>
              )}

              <button
                onClick={openLoginModal}
                className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                title="ログイン"
              >
                {isAuthenticated ? walletLabel : 'ログイン'}
              </button>

              {isAuthenticated && (
                <button
                  onClick={handleLogout}
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
                onClick={openLoginModal}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                {isAuthenticated ? 'アカウント' : 'ログイン'}
              </button>
              <button
                className={`p-2 rounded-lg ${
                  scrolled ? 'text-slate-600 hover:bg-slate-100' : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setMobileOpen((v) => !v)}
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
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">ウォレット状態</span>
                <span className="text-xs font-semibold text-slate-900">{walletLabel}</span>
              </div>

              {isAuthenticated && balance !== null && (
                <div className="px-3 py-2 rounded-lg text-sm font-semibold bg-jpyc-50 text-jpyc-700">
                  残高: {(balance / 100).toLocaleString('ja-JP')} JPYC
                </div>
              )}

              {authError && <p className="text-xs text-red-500 px-1">{authError}</p>}

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.href);
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
          onClick={closeLoginModal}
          role="dialog"
          aria-modal="true"
          aria-label="ログイン方法選択"
        >
          <div
            className="mx-auto mt-16 w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">ログイン方法を選択</h2>
                <p className="text-sm text-slate-500 mt-1">ウォレット接続またはソーシャルアカウントでログインできます。</p>
              </div>
              <button
                onClick={closeLoginModal}
                className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="min-h-[320px] rounded-2xl border border-slate-200 p-5 bg-slate-50/50 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center font-bold">G</div>
                  <h3 className="text-lg font-bold text-slate-900">ソーシャルログイン</h3>
                </div>
                <p className="text-sm text-slate-600 leading-6">
                  Google / X / Email でログインし、スマートウォレットを自動作成する導線です。
                </p>
                <button
                  onClick={handleSocialLogin}
                  disabled={socialSigning || signing}
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
                  MetaMask など既存ウォレットを接続し、署名認証でログインします。
                </p>
                <p className="text-xs text-slate-500 mt-2 mb-5">現在: {walletLabel}</p>
                <button
                  onClick={handleWalletLogin}
                  disabled={connecting || signing || isAuthenticated || pendingWalletSignIn}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-auto"
                >
                  {walletActionLabel}
                </button>
              </section>
            </div>

            {(socialHint || authError || connectError) && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
                {socialHint && <p className="text-xs text-slate-600">{socialHint}</p>}
                {authError && <p className="text-xs text-red-600">{authError}</p>}
                {connectError && <p className="text-xs text-red-600">{connectError.message}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
