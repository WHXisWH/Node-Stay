import Link from 'next/link';

const supportEntries = [
  { href: '/help/faq', title: 'よくある質問', desc: 'ログイン、購入、譲渡、決済で多い質問をまとめています。' },
  { href: '/help/contact', title: 'お問い合わせ', desc: '不具合や導入相談の連絡窓口です。' },
  { href: '/help/status', title: 'システム状態', desc: 'API やチェーン連携の稼働状況を確認できます。' },
] as const;

export default function HelpCenterPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">ヘルプセンター</h1>
        <p className="mt-4 text-slate-600 leading-7">
          Node Stay の利用中に困ったときの案内ページです。ログインやウォレット接続に関する問題は、まず「よくある質問」をご確認ください。
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {supportEntries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
          >
            <h2 className="text-lg font-semibold text-slate-900">{entry.title}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-6">{entry.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
