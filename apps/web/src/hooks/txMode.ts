import type { LoginMethod } from '../models/stores/user.store';

/** AA または通常ウォレット */
export type TxMode = 'aa' | 'wallet';

/**
 * 書き込み経路を一元判定する。
 * loginMethod が未復元（null）の間は、ウォレット未接続なら AA を優先する。
 */
export function resolveTxMode(loginMethod: LoginMethod, walletConnected: boolean): TxMode {
  if (loginMethod === 'social') return 'aa';
  if (loginMethod === 'wallet') return 'wallet';
  return walletConnected ? 'wallet' : 'aa';
}
