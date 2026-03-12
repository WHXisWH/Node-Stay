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
  blockExplorerUrl: process.env.NEXT_PUBLIC_CHAIN_EXPLORER_URL ?? 'https://amoy.polygonscan.com',
} as const;

/** 環境設定診断結果 */
export interface ConfigDiagnostics {
  ok: boolean;
  errors: string[];
}

/**
 * 環境設定を診断する
 * chainId / コントラクトアドレスの検証を行い、不正な場合はエラーリストを返す
 */
export function getConfigDiagnostics(): ConfigDiagnostics {
  const errors: string[] = [];

  const chainIdRaw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (chainIdRaw !== undefined && chainIdRaw !== '') {
    const n = Number(chainIdRaw);
    if (Number.isNaN(n) || n <= 0) {
      errors.push(`NEXT_PUBLIC_CHAIN_ID が無効: "${chainIdRaw}"（正の整数である必要があります）`);
    }
  }

  const addrs = CONTRACT_ADDRESSES;
  if (!addrs.machineRegistry?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_MACHINE_REGISTRY_ADDRESS が未設定または無効です');
  }
  if (!addrs.jpycToken?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_JPYC_TOKEN_ADDRESS が未設定または無効です');
  }
  if (!addrs.settlement?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_SETTLEMENT_ADDRESS が未設定または無効です');
  }
  if (!addrs.marketplace?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_MARKETPLACE_ADDRESS が未設定または無効です');
  }
  if (!addrs.usageRight?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_USAGE_RIGHT_ADDRESS が未設定または無効です');
  }
  if (!addrs.computeRight?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS が未設定または無効です');
  }
  if (!addrs.revenueRight?.startsWith('0x')) {
    errors.push('NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS が未設定または無効です');
  }

  return { ok: errors.length === 0, errors };
}
