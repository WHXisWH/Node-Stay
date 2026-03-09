/**
 * wagmi 設定ファイル
 * Polygon PoS（メインネット）と Polygon Amoy（テストネット）を設定する。
 * 開発環境の安定性を優先し、WalletConnect 依存を避けて injected connector を使用する。
 */

import { createConfig, http } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [polygon, polygonAmoy],
  connectors: [
    injected({
      target: 'metaMask',
      shimDisconnect: false,
    }),
    injected({
      target: 'coinbaseWallet',
      shimDisconnect: false,
    }),
    injected({
      shimDisconnect: false,
    }),
  ],
  transports: {
    [polygon.id]: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL ?? 'https://polygon-rpc.com'),
    [polygonAmoy.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc-amoy.polygon.technology'),
  },
  ssr: true,
});
