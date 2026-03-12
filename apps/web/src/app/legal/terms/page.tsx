const termSections = [
  {
    title: '第1条（適用）',
    body: '本規約は Node Stay の提供条件および利用者と運営者の権利義務を定めるものです。',
  },
  {
    title: '第2条（アカウント）',
    body: '利用者はウォレットまたはソーシャル認証を用いてログインし、自己責任で認証情報を管理するものとします。',
  },
  {
    title: '第3条（禁止事項）',
    body: '不正アクセス、他者へのなりすまし、法令違反、サービス運営を妨げる行為を禁止します。',
  },
  {
    title: '第4条（免責）',
    body: 'ブロックチェーンの性質上、トランザクション確定遅延や外部障害により処理が遅れる場合があります。',
  },
] as const;

export default function LegalTermsPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">利用規約</h1>
        <p className="mt-4 text-slate-600">正式版公開までの暫定条項です。改定時は本ページで告知します。</p>
      </div>

      <div className="mt-10 space-y-4 max-w-4xl">
        {termSections.map((section) => (
          <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-7">{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
