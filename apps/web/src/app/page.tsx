// ホームページ
// ヒーローセクション、機能紹介、仕組み説明、CTAを表示する

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Node Stay — ネットカフェ利用権プラットフォーム',
};

// ===== ヒーローセクション =====
function HeroSection() {
  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden bg-surface-900">
      {/* 背景グラデーション */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99,102,241,0.25) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(245,158,11,0.12) 0%, transparent 60%)',
        }}
      />

      {/* グリッドパターン */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="container-main relative z-10 py-32">
        <div className="max-w-3xl">
          {/* バッジ */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-500/10 border border-brand-500/20 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
            <span className="text-brand-300 text-sm font-medium">
              Polygon PoS × JPYC 決済対応
            </span>
          </div>

          {/* メインヘッドライン */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
            ネットカフェを
            <br />
            <span
              className="text-gradient"
              style={{
                background: 'linear-gradient(135deg, #818CF8 0%, #C084FC 50%, #F472B6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              プログラム可能な
            </span>
            <br />
            資産へ
          </h1>

          {/* サブコピー */}
          <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-10 max-w-xl">
            座席利用権をトークン化し、遊休PCをコンピュートノードとして活用。
            すべての決済をJPYCで自動化する次世代プラットフォーム。
          </p>

          {/* CTAボタン群 */}
          <div className="flex flex-wrap gap-4">
            <Link
              href="/venues"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all duration-150 shadow-lg hover:shadow-glow text-base"
            >
              店舗を探す
              <svg
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/passes"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold rounded-xl transition-all duration-150 text-base"
            >
              マイパスを確認
            </Link>
          </div>

          {/* 主要機能 */}
          <div className="flex flex-wrap gap-8 mt-16 pt-8 border-t border-white/10">
            {[
              { title: '利用権の購入', detail: '店舗プランをオンチェーン管理' },
              { title: 'QRチェックイン', detail: '利用開始をスムーズに実行' },
              { title: 'JPYC決済', detail: '購入と精算を一元化' },
            ].map((item) => (
              <div key={item.title}>
                <div className="text-lg font-bold text-white">{item.title}</div>
                <div className="text-sm text-slate-400 mt-0.5">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右側デコレーション（デスクトップのみ） */}
      <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[480px] h-[480px] opacity-20">
        <div className="relative w-full h-full">
          {/* 同心円グロー */}
          {[1, 0.6, 0.35].map((scale, i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border border-brand-400"
              style={{
                transform: `scale(${scale})`,
                opacity: scale,
              }}
            />
          ))}
          {/* ノードポイント */}
          {[
            { top: '10%', left: '50%', color: '#818CF8' },
            { top: '50%', left: '5%', color: '#F472B6' },
            { top: '50%', left: '95%', color: '#34D399' },
            { top: '85%', left: '25%', color: '#FBBF24' },
            { top: '85%', left: '75%', color: '#60A5FA' },
          ].map((node, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full animate-pulse-slow"
              style={{
                top: node.top,
                left: node.left,
                transform: 'translate(-50%, -50%)',
                backgroundColor: node.color,
                boxShadow: `0 0 12px ${node.color}`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== 機能紹介セクション =====
function FeaturesSection() {
  // 機能カードデータ定義
  const features = [
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-500"
        >
          {/* チケットアイコン */}
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <line x1="9" y1="12" x2="15" y2="12" strokeDasharray="2" />
        </svg>
      ),
      title: '利用権トークン化',
      description:
        '3時間・6時間・ナイトパックなど、各種料金プランを利用権として購入。QRコードでスムーズにチェックイン。',
      color: 'bg-brand-50',
      badge: '座席市場',
      badgeColor: 'badge-blue',
    },
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-jpyc-500"
        >
          {/* コインアイコン */}
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12" />
          <path d="M15.5 9H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8.5" />
        </svg>
      ),
      title: 'JPYC 自動決済',
      description:
        'デポジット凍結・超過課金・返金まで、円建てステーブルコインで全自動。手数料はGas実費のみ。',
      color: 'bg-jpyc-50',
      badge: '決済',
      badgeColor: 'badge-yellow',
    },
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-500"
        >
          {/* CPUアイコン */}
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      ),
      title: '遊休コンピュートレンタル',
      description:
        '平日・日中の空きPCをAI/MLレンダリングノードとして提供。店舗は座席収入に加えコンピュート収益を獲得。',
      color: 'bg-emerald-50',
      badge: 'コンピュート市場',
      badgeColor: 'badge-green',
    },
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-violet-500"
        >
          {/* 送金アイコン */}
          <path d="M16 3h5v5" />
          <path d="M8 3H3v5" />
          <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
          <path d="M21 3l-8.828 8.828" />
        </svg>
      ),
      title: '利用権の譲渡',
      description:
        '時間パックを安全に譲渡可能。24時間クールダウン・KYC再確認・プラットフォーム5%手数料で透明性を確保。',
      color: 'bg-violet-50',
      badge: '譲渡マーケット',
      badgeColor: 'badge-blue',
    },
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-rose-500"
        >
          {/* シールドアイコン */}
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      ),
      title: 'コンプライアンス対応',
      description:
        '本人確認・端末利用記録・保存年数などを店舗ごとにパラメータ設定。監査証跡を改ざん検知可能な形で保管。',
      color: 'bg-rose-50',
      badge: '法規制対応',
      badgeColor: 'badge-red',
    },
    {
      icon: (
        <svg
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-sky-500"
        >
          {/* グラフアイコン */}
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: '収益レポート',
      description:
        '座席売上・コンピュート収益・返金・手数料を日次/週次/月次で一覧。JPYC出金リクエストもダッシュボードから。',
      color: 'bg-sky-50',
      badge: '事業者向け',
      badgeColor: 'badge-blue',
    },
  ] as const;

  return (
    <section className="py-24 bg-white">
      <div className="container-main">
        {/* セクションヘッダー */}
        <div className="text-center mb-16">
          <span className="section-label">プラットフォーム機能</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
            ネットカフェ運営を
            <br className="sm:hidden" />
            次のステージへ
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            利用者・店舗・コンピュート需要者の三者が共に恩恵を受ける、持続可能なエコシステム
          </p>
        </div>

        {/* 機能カードグリッド */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="card p-6 group cursor-default"
            >
              {/* アイコン背景 */}
              <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200`}>
                {feature.icon}
              </div>

              {/* バッジ */}
              <span className={`${feature.badgeColor} mb-3`}>{feature.badge}</span>

              {/* タイトル */}
              <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>

              {/* 説明文 */}
              <p className="text-slate-500 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== 仕組み説明セクション =====
function HowItWorksSection() {
  // ステップデータ
  const steps = [
    {
      step: '01',
      icon: '🔍',
      title: '店舗を探す',
      desc: '近隣のネットカフェをエリア・スペック・価格で絞り込み。空席状況をリアルタイム確認。',
    },
    {
      step: '02',
      icon: '🎟',
      title: '利用権を購入',
      desc: '希望の時間パックをJPYCで購入。デポジットが自動的に凍結され、超過も自動精算。',
    },
    {
      step: '03',
      icon: '📱',
      title: 'QRチェックイン',
      desc: '来店時にQRコードをスキャンするだけ。KYC済みなら即座に着席。',
    },
    {
      step: '04',
      icon: '✅',
      title: 'チェックアウト',
      desc: '退席時に自動精算。超過料金は最安パックに自動アップグレードで安心。',
    },
  ] as const;

  return (
    <section className="py-24 bg-surface-50">
      <div className="container-main">
        {/* セクションヘッダー */}
        <div className="text-center mb-16">
          <span className="section-label">ご利用の流れ</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
            4ステップで完結
          </h2>
          <p className="text-slate-500 text-lg max-w-lg mx-auto">
            ウォレット不要、チェーンを意識させないUXで誰でも簡単に利用可能
          </p>
        </div>

        {/* ステップグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item, index) => (
            <div key={item.step} className="relative">
              {/* 矢印コネクター（最後以外） */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-brand-200 to-transparent z-10 -translate-x-4" />
              )}

              <div className="card p-6 text-center h-full">
                {/* ステップ番号 */}
                <div className="text-xs font-extrabold text-brand-400 tracking-widest mb-3">
                  STEP {item.step}
                </div>

                {/* アイコン */}
                <div className="text-4xl mb-4">{item.icon}</div>

                {/* タイトル */}
                <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>

                {/* 説明 */}
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== 料金プランセクション =====
function PricingHighlightSection() {
  // 超過料金ルール（PRDから引用）
  const overtimeRules = [
    { range: '0〜10分', fee: '無料', note: 'バッファ時間', variant: 'green' },
    { range: '11〜30分', fee: '100 JPYC/10分', note: '短時間超過', variant: 'yellow' },
    { range: '31〜60分', fee: '150 JPYC/10分', note: '中程度超過', variant: 'orange' },
    { range: '60分以上', fee: '次パックへ自動切替', note: '累積上限防止', variant: 'blue' },
  ] as const;

  return (
    <section className="py-24 bg-white">
      <div className="container-main">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* 左側：説明テキスト */}
          <div>
            <span className="section-label">透明な料金体系</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-5">
              超過料金も
              <br />
              驚きなし
            </h2>
            <p className="text-slate-500 text-lg leading-relaxed mb-6">
              料金は自動で最安パックに切り替わります。上限キャップで安心して利用できる設計。
              すべての課金は明細としてJPYCブロックチェーン上に記録されます。
            </p>

            {/* 特徴リスト */}
            <ul className="flex flex-col gap-3">
              {[
                'チェックアウト時に一括精算（分単位マイクロ決済なし）',
                'デポジットは凍結→捕捉→差額解除で完全自動',
                '最安パック自動アップグレードで請求上限を保証',
                '無断退出・通信断時も自動精算フローで安心',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg
                      width="10"
                      height="10"
                      fill="none"
                      stroke="#6366F1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2 5 4.5 8 9 2" />
                    </svg>
                  </div>
                  <span className="text-slate-600 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 右側：超過料金テーブル */}
          <div className="card overflow-hidden">
            {/* テーブルヘッダー */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-700">超過課金ルール（標準設定）</h3>
            </div>

            {/* テーブルボディ */}
            <div className="divide-y divide-slate-50">
              {overtimeRules.map((rule) => (
                <div
                  key={rule.range}
                  className="px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{rule.range}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{rule.note}</div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`badge ${
                        rule.variant === 'green'
                          ? 'badge-green'
                          : rule.variant === 'yellow'
                          ? 'badge-yellow'
                          : rule.variant === 'blue'
                          ? 'badge-blue'
                          : 'bg-orange-100 text-orange-700 badge'
                      }`}
                    >
                      {rule.fee}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 注記 */}
            <div className="px-6 py-4 bg-brand-50 border-t border-brand-100">
              <p className="text-xs text-brand-600">
                ※ 単回請求上限：元料金×1.5倍（ユーザーの心理的安全のため）
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===== 収益分配セクション（事業者向け） =====
function RevenueSection() {
  return (
    <section className="py-24 bg-surface-900 text-white">
      <div className="container-main">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-jpyc-500/10 border border-jpyc-500/20 rounded-full text-jpyc-300 text-sm font-semibold mb-4">
            加盟店の収益
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            遊休リソースを
            <br />
            収益に変える
          </h2>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            平日・日中の空きPCをコンピュートノードとして提供し、座席収入に加えて新たな収益源を確保
          </p>
        </div>

        {/* 収益分配カード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            {
              label: 'ネットカフェ店舗',
              rate: '75%',
              desc: 'ハードウェア・電力提供への報酬',
              color: 'from-jpyc-500/20 to-jpyc-600/10',
              border: 'border-jpyc-500/20',
              textColor: 'text-jpyc-400',
            },
            {
              label: 'プラットフォーム',
              rate: '25%',
              desc: 'スケジューリング・決済・サポート',
              color: 'from-brand-500/20 to-brand-600/10',
              border: 'border-brand-500/20',
              textColor: 'text-brand-400',
            },
            {
              label: '決済コスト',
              rate: '実費',
              desc: 'Gas・換金・流動性コスト（透明開示）',
              color: 'from-slate-500/20 to-slate-600/10',
              border: 'border-slate-500/20',
              textColor: 'text-slate-400',
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`bg-gradient-to-br ${item.color} border ${item.border} rounded-2xl p-6 text-center`}
            >
              <div className={`text-4xl font-extrabold ${item.textColor} mb-2`}>{item.rate}</div>
              <div className="text-white font-semibold mb-1">{item.label}</div>
              <div className="text-slate-400 text-sm">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* 事業者向けCTA */}
        <div className="text-center mt-12">
          <Link
            href="/merchant/register"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-jpyc-500 hover:bg-jpyc-600 text-white font-semibold rounded-xl transition-all duration-150 shadow-lg text-base"
          >
            加盟店として登録する
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ===== CTAセクション =====
function CtaSection() {
  return (
    <section className="py-24 bg-white">
      <div className="container-main">
        {/* グラデーション背景カード */}
        <div
          className="rounded-3xl p-12 md:p-16 text-center relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E1B4B 100%)',
          }}
        >
          {/* 装飾ブラー */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-brand-500 rounded-full blur-3xl opacity-10 -translate-y-1/2" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-jpyc-500 rounded-full blur-3xl opacity-10 translate-y-1/2" />

          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              今すぐ始めよう
            </h2>
            <p className="text-slate-300 text-lg mb-8 max-w-lg mx-auto">
              近くのネットカフェを探して、JPYCで利用権を購入。
              <br className="hidden sm:block" />
              ウォレットがなくても、スマートフォン一つで完結します。
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/venues"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-700 font-bold rounded-xl hover:bg-brand-50 transition-colors text-base shadow-lg"
              >
                店舗を検索する
              </Link>
              <Link
                href="/help"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-transparent border border-white/20 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors text-base"
              >
                使い方を見る
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===== ページコンポーネント =====
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingHighlightSection />
      <RevenueSection />
      <CtaSection />
    </>
  );
}
