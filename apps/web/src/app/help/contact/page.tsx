import Link from 'next/link';

const contacts = [
  {
    label: '技術サポート',
    value: 'support@nodestay.example',
    note: 'ログイン不具合、署名エラー、画面表示の不具合はこちら',
  },
  {
    label: '事業提携・加盟店相談',
    value: 'biz@nodestay.example',
    note: '加盟店登録、料金設計、運用フロー相談はこちら',
  },
] as const;

export default function HelpContactPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">お問い合わせ</h1>
        <p className="mt-4 text-slate-600 leading-7">
          ご連絡の際は、利用ブラウザ、接続ウォレット種別、発生時刻、表示されたエラーメッセージをあわせてお知らせください。
        </p>
      </div>

      <div className="mt-10 space-y-4 max-w-3xl">
        {contacts.map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
            <p className="mt-2 text-sm text-slate-600">{item.note}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        仕様書と技術資料は
        <Link href="/docs/api" className="mx-1 font-semibold text-brand-700 hover:text-brand-800">
          API ドキュメント
        </Link>
        および
        <Link href="/docs/compute" className="mx-1 font-semibold text-brand-700 hover:text-brand-800">
          コンピュート提供ガイド
        </Link>
        をご確認ください。
      </div>
    </section>
  );
}
