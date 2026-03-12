import Link from 'next/link';

const steps = [
  '提供端末を登録し、スペック・料金・利用条件を設定する',
  '利用権とコンピュート商品の公開条件を定義する',
  '決済後の提供フローとセッション管理を運用する',
  '売上・手数料・監査ログを定期確認する',
] as const;

export default function DocsComputePage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">コンピュート提供ガイド</h1>
        <p className="mt-4 text-slate-600 leading-7">
          事業者がコンピュートリソースを出品・運用するための導線をまとめたガイドです。
        </p>
      </div>

      <div className="mt-10 max-w-4xl space-y-3">
        {steps.map((step, index) => (
          <article key={step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-brand-700">STEP {index + 1}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{step}</p>
          </article>
        ))}
      </div>

      <p className="mt-8 max-w-4xl text-sm text-slate-600">
        詳細な仕様背景は
        <Link
          href="https://github.com/WHXisWH/Node-Stay/tree/main/docs"
          target="_blank"
          rel="noreferrer"
          className="mx-1 font-semibold text-brand-700 hover:text-brand-800"
        >
          docs ディレクトリ
        </Link>
        のアーキテクチャ資料を参照してください。
      </p>
    </section>
  );
}
