const privacyPoints = [
  '認証、購入、譲渡、セッション管理に必要な範囲でユーザーデータを処理します。',
  'ウォレットアドレス、操作ログ、サポート対応履歴を安全管理のために記録します。',
  '法令または規制当局からの要請がある場合を除き、第三者へ不必要に提供しません。',
  '本人からの開示・訂正・削除依頼はサポート窓口で受け付けます。',
] as const;

export default function LegalPrivacyPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">プライバシーポリシー</h1>
        <p className="mt-4 text-slate-600">個人情報および関連データの取扱方針を定めています。</p>
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-4xl">
        <ul className="space-y-3 text-sm leading-7 text-slate-600 list-disc pl-5">
          {privacyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
