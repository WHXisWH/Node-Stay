// ルートレイアウト
// アプリ全体の共通レイアウト（ヘッダー、フッター、グローバルスタイル）を定義する

import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { Web3Provider } from '../providers/Web3Provider';
import './globals.css';

// メタデータ定義（SEO・OGP）
export const metadata: Metadata = {
  title: {
    default: 'Node Stay — ネットカフェ利用権プラットフォーム',
    template: '%s | Node Stay',
  },
  description:
    'ネットカフェの座席をJPYCで購入・管理。利用権トークン化と遊休コンピュートレンタルの両面マーケットプラットフォーム。',
  keywords: ['ネットカフェ', 'JPYC', 'Web3', '利用権', 'ブロックチェーン', 'Polygon'],
  robots: { index: true, follow: true },
};

// ビューポート設定
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366F1',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* Google Fonts プリコネクト最適化 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        {/* Web3 プロバイダ（wagmi + RainbowKit + TanStack Query） */}
        <Web3Provider>
          {/* グローバルヘッダー */}
          <Header />

          {/* メインコンテンツ */}
          <main className="flex-1">
            {children}
          </main>

          {/* グローバルフッター */}
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}
