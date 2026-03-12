const items = [
  { label: '販売事業者', value: 'Node Stay 運営事務局' },
  { label: '運営責任者', value: 'お問い合わせ窓口にてご案内します' },
  { label: '所在地', value: 'お問い合わせ窓口にてご案内します' },
  { label: 'お問い合わせ先', value: 'support@nodestay.example' },
  { label: '販売価格', value: '各商品ページに税込価格を表示' },
  { label: '支払方法', value: 'JPYC（Polygon）' },
  { label: '役務提供時期', value: '決済確定後、即時または店舗規定に従い提供' },
  { label: '返品・キャンセル', value: 'デジタル商品特性上、原則不可（法令上の例外を除く）' },
] as const;

export default function LegalTokushoPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">特定商取引法に基づく表記</h1>
        <p className="mt-4 text-slate-600">特定商取引法第11条に基づく表示です。</p>
      </div>

      <div className="mt-10 max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <dl>
          {items.map((item) => (
            <div key={item.label} className="grid grid-cols-1 border-b border-slate-100 px-5 py-4 md:grid-cols-[220px_1fr] md:gap-6">
              <dt className="text-sm font-semibold text-slate-900">{item.label}</dt>
              <dd className="mt-1 text-sm leading-7 text-slate-600 md:mt-0">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
