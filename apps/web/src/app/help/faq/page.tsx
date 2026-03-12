const faqItems = [
  {
    q: 'ログイン後に認証状態が更新されません。',
    a: '最新版では認証成功時に状態を自動再同期します。画面が古い場合は、ブラウザのキャッシュ削除後に再度ログインしてください。',
  },
  {
    q: 'ウォレット接続済みのままソーシャルログインしても問題ありませんか。',
    a: '可能です。ソーシャル認証中はソーシャル側の署名情報を優先して処理します。不要な場合は先にログアウトしてください。',
  },
  {
    q: '署名画面のまま進まない場合はどうすればよいですか。',
    a: 'ウォレットまたは Web3Auth の確認画面が背面にある可能性があります。確認後も進まない場合は、タイムアウト後に再試行してください。',
  },
  {
    q: '対応ネットワークは何ですか。',
    a: '運用環境に応じて Polygon PoS または Polygon Amoy を利用します。画面下部のネットワーク表示をご確認ください。',
  },
] as const;

export default function HelpFaqPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">よくある質問</h1>
        <p className="mt-4 text-slate-600">ログイン、ウォレット、購入フローでお問い合わせの多い内容を掲載しています。</p>
      </div>

      <div className="mt-10 space-y-4">
        {faqItems.map((item) => (
          <article key={item.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{item.q}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
