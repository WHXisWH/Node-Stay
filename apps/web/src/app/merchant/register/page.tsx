import Link from 'next/link';

const requirements = [
  '店舗情報（事業者名・所在地・連絡先）',
  '提供可能な端末スペックと台数',
  '利用料金と返金ポリシー',
  '本人確認・運用責任者情報',
] as const;

export default function MerchantRegisterPage() {
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

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/merchant/dashboard"
            className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            管理画面へ進む
          </Link>
          <Link
            href="/help/contact"
            className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            導入相談をする
          </Link>
        </div>
      </div>
    </section>
  );
}
