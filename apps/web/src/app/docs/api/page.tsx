import Link from 'next/link';

const apiTopics = [
  '認証 API（nonce / verify）',
  '会場・利用権・マーケットプレイス API',
  '収益権ダッシュボード API',
  'マーチャント運用 API',
] as const;

export default function DocsApiPage() {
  return (
    <section className="container-main py-24">
      <div className="max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">API ドキュメント</h1>
        <p className="mt-4 text-slate-600 leading-7">
          Node Stay API の利用概要です。詳細仕様はリポジトリ内の設計資料とあわせてご確認ください。
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-4xl">
        <h2 className="text-base font-semibold text-slate-900">主要トピック</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
          {apiTopics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-slate-600">
          実装と整合した最新情報は
          <Link
            href="https://github.com/WHXisWH/Node-Stay/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="mx-1 font-semibold text-brand-700 hover:text-brand-800"
          >
            docs ディレクトリ
          </Link>
          を参照してください。
        </p>
      </div>
    </section>
  );
}
