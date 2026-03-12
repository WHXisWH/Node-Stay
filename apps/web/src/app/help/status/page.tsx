const statusItems = [
  { name: 'API サーバー', status: '監視中', detail: '認証・会場検索・利用権 API を継続監視しています。' },
  { name: 'チェーン同期', status: '監視中', detail: 'インデクサとブロック同期遅延を定期チェックしています。' },
  { name: '決済フロー', status: '監視中', detail: 'JPYC 承認と購入トランザクションを監視しています。' },
] as const;

export default function HelpStatusPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">システム状態</h1>
        <p className="mt-4 text-slate-600 leading-7">
          このページは運用監視の要約です。詳細な障害情報はサポート窓口から順次ご案内します。
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {statusItems.map((item) => (
          <article key={item.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.name}</p>
            <p className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {item.status}
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-6">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
