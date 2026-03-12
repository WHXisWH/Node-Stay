const controls = [
  {
    title: '本人確認・利用要件',
    detail: '店舗運用ポリシーおよび法令に応じて本人確認を実施し、未達の場合は利用を制限します。',
  },
  {
    title: '不正利用監視',
    detail: '異常アクセス、短時間連続取引、譲渡リスクを監視し、必要に応じて追加確認を行います。',
  },
  {
    title: '監査証跡の保持',
    detail: '認証、購入、譲渡、精算のイベントログを一定期間保持し、監査要求に対応します。',
  },
] as const;

export default function LegalCompliancePage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">コンプライアンス</h1>
        <p className="mt-4 text-slate-600">
          金融関連規制、個人情報保護、利用者保護の観点から、運用上の統制方針を定めています。
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {controls.map((control) => (
          <article key={control.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{control.title}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-7">{control.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
