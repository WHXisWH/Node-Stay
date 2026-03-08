// フッターコンポーネント
// サービス説明、リンク、コンプライアンス情報を表示する

import Link from 'next/link';

// フッターリンク定義
const FOOTER_LINKS = {
  サービス: [
    { href: '/venues', label: '店舗を探す' },
    { href: '/marketplace', label: 'マーケットプレイス' },
    { href: '/usage-rights', label: 'マイ利用権' },
    { href: '/sessions', label: 'チェックイン' },
    { href: '/compute', label: 'コンピュートマーケット' },
  ],
  サポート: [
    { href: '/help', label: 'ヘルプセンター' },
    { href: '/help/faq', label: 'よくある質問' },
    { href: '/help/contact', label: 'お問い合わせ' },
    { href: '/help/status', label: 'システム状態' },
  ],
  法務: [
    { href: '/legal/terms', label: '利用規約' },
    { href: '/legal/privacy', label: 'プライバシーポリシー' },
    { href: '/legal/tokusho', label: '特定商取引法' },
    { href: '/legal/compliance', label: 'コンプライアンス' },
  ],
  事業者様: [
    { href: '/merchant', label: '店舗管理画面' },
    { href: '/merchant/register', label: '加盟店登録' },
    { href: '/docs/api', label: 'API ドキュメント' },
    { href: '/docs/compute', label: 'コンピュート提供ガイド' },
  ],
} as const;

export function Footer() {
  return (
    <footer className="bg-surface-900 text-white">
      {/* メインフッター */}
      <div className="container-main py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* ブランド情報（左側） */}
          <div className="lg:col-span-1">
            {/* ロゴ */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="5" cy="19" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <line x1="12" y1="7" x2="12" y2="12" />
                  <line x1="12" y1="12" x2="5.5" y2="17.5" />
                  <line x1="12" y1="12" x2="18.5" y2="17.5" />
                </svg>
              </div>
              <span className="font-bold text-lg">Node Stay</span>
            </div>

            {/* サービス説明 */}
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              ネットカフェの座席をプログラム可能な資産に変える、JPYC決済プラットフォーム
            </p>

            {/* JPYC バッジ */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-jpyc-500/10 border border-jpyc-500/20 rounded-lg">
              <span className="text-jpyc-400 text-sm font-semibold">JPYC</span>
              <span className="text-slate-400 text-xs">対応決済</span>
            </div>
          </div>

          {/* リンクグループ */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-slate-300 mb-4">{group}</h3>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-500 hover:text-slate-200 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ボトムバー */}
      <div className="border-t border-slate-800">
        <div className="container-main py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* コピーライト */}
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} Node Stay. All rights reserved.
            </p>

            {/* 免責事項 */}
            <p className="text-slate-600 text-xs text-center md:text-right max-w-md">
              本サービスは法務相談前提のMVPです。金融規制・本人確認要件については管轄当局にご確認ください。
            </p>

            {/* ネットワーク情報 */}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              <span>Polygon PoS</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
