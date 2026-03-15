'use client';

import Link from 'next/link';
import { useUserState } from '../../hooks/useUserState';

export default function MerchantIndexPage() {
  const { isAuthenticated, walletLabel, loginMethod } = useUserState();

  const handleOpenLoginModal = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('nodestay:open-login-modal'));
  };

  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">加盟店ログイン</h1>
        <p className="mt-4 text-slate-600 leading-7">
          収益権プログラムの発行、マシン管理、精算レポートは加盟店ダッシュボードから操作します。
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-4xl">
        <h2 className="text-base font-semibold text-slate-900">アクセス方法</h2>
        <p className="mt-2 text-sm text-slate-600">
          {isAuthenticated
            ? `現在ログイン中です（${walletLabel} / ${loginMethod === 'social' ? 'ソーシャル認証' : 'ウォレット認証'}）。`
            : '先にログインしてからダッシュボードへ進んでください。'}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {isAuthenticated ? (
            <Link href="/merchant/dashboard" className="btn-primary py-2.5 px-4 text-sm">
              ダッシュボードへ進む
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleOpenLoginModal}
              className="btn-primary py-2.5 px-4 text-sm"
            >
              ログインする
            </button>
          )}

          <Link href="/merchant/register" className="btn-secondary py-2.5 px-4 text-sm">
            加盟店登録
          </Link>
        </div>
      </div>
    </section>
  );
}
