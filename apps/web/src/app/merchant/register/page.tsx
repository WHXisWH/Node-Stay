 'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createNodeStayClient } from '../../../services/nodestay';
import { useUserState } from '../../../hooks/useUserState';

const requirements = [
  '店舗情報（事業者名・所在地・連絡先）',
  '提供可能な端末スペックと台数',
  '利用料金と返金ポリシー',
  '本人確認・運用責任者情報',
] as const;

export default function MerchantRegisterPage() {
  const router = useRouter();
  const { isAuthenticated } = useUserState();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tokyo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleOpenLogin = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('nodestay:open-login-modal'));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const venueName = name.trim();
    const venueAddress = address.trim();
    if (!venueName) {
      setError('店舗名を入力してください。');
      return;
    }
    if (!venueAddress) {
      setError('所在地を入力してください。');
      return;
    }

    if (!isAuthenticated) {
      setError('加盟店登録にはログインが必要です。');
      return;
    }

    setSubmitting(true);
    try {
      const client = createNodeStayClient();
      await client.createVenueAsMerchant({
        name: venueName,
        address: venueAddress,
        timezone: timezone.trim() || 'Asia/Tokyo',
      });
      setNotice('店舗を作成しました。ダッシュボードへ移動します。');
      router.push('/merchant/dashboard?venueCreated=1');
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '店舗の作成に失敗しました。';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">加盟店登録</h1>
        <p className="mt-4 text-slate-600 leading-7">
          加盟店として出店する際に必要な準備項目です。登録後は管理画面で商品公開と在庫運用を行えます。
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-4xl">
        <h2 className="text-base font-semibold text-slate-900">提出情報</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
          {requirements.map((req) => (
            <li key={req}>{req}</li>
          ))}
        </ul>

        {!isAuthenticated && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">登録前に加盟店ログインしてください。</p>
            <button
              type="button"
              onClick={handleOpenLogin}
              className="mt-3 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              ログインする
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">店舗名</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: NodeCafe 渋谷センター"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">所在地</label>
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="例: 東京都渋谷区..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">タイムゾーン</label>
            <input
              type="text"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
              disabled={submitting}
            />
          </div>

          {notice && <p className="text-sm text-emerald-600">{notice}</p>}
          {error && <p className="text-sm text-red-600 break-all">{error}</p>}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? '店舗を作成中...' : '店舗を作成して進む'}
            </button>
            <Link
              href="/merchant/login"
              className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              加盟店ログインへ戻る
            </Link>
            <Link
              href="/help/contact"
              className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              導入相談をする
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
