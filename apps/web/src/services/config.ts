export function getApiBaseUrl(value: string | undefined): string {
  return (value ?? 'http://localhost:3001').replace(/\/+$/, '');
}

// Polygon Amoy テストネット コントラクトアドレス
export const CONTRACT_ADDRESSES = {
  machineRegistry: process.env.NEXT_PUBLIC_MACHINE_REGISTRY_ADDRESS ?? '',
  usageRight:      process.env.NEXT_PUBLIC_USAGE_RIGHT_ADDRESS      ?? '',
  settlement:      process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS       ?? '',
  marketplace:     process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS      ?? '',
  computeRight:    process.env.NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS    ?? '',
  revenueRight:    process.env.NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS    ?? '',
  // indexer 互換: 旧キー名（内部的には computeRight と同値で運用）
  computeMarket:   process.env.NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS    ?? '',
  jpycToken:       process.env.NEXT_PUBLIC_JPYC_TOKEN_ADDRESS       ?? '',
} as const;

// チェーン設定（W3: フロントエンドのオンチェーン連携スタックは viem。Provider は公開/独自 RPC）
export const CHAIN_CONFIG = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '80002'),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'Polygon Amoy',
  /** RPC URL for read-only getLogs / getBlockNumber (no WS required for indexer) */
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc-amoy.polygon.technology',
} as const;
