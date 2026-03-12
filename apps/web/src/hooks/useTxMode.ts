'use client';

/**
 * useTxMode — 統一トランザクションルーター（問題 3・8 対応）
 *
 * loginMethod に応じて JPYC approve の実行経路を決定する。
 *   social（AA）モード : UserOperation として sendUserOp で実行（ガスレス）
 *   wallet モード      : wagmi の writeContract で実行（通常署名）
 *
 * 購入フローを持つすべてのページ（venue 詳細・マーケット等）はこのフックに統一し、
 * ページ個別に loginMethod を分岐させない。
 */

import { useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { useUserStore } from '../models/stores/user.store';
import { useAaTransaction } from './useAaTransaction';
import { useJPYCApprove } from './useJPYC';
import { encodeJpycApprove } from '../services/aa/encodeMarketplaceCalls';
import { CONTRACT_ADDRESSES } from '../services/config';

/** AA または通常ウォレット */
export type TxMode = 'aa' | 'wallet';

export interface UseTxModeReturn {
  /** 現在のトランザクション実行モード */
  mode: TxMode;
  /**
   * JPYC の approve を実行する。
   * social モード → AA UserOperation、wallet モード → wagmi writeContract。
   * @param spender    approve 先コントラクトアドレス
   * @param amountJPYC approve 金額（JPYC 単位、例: 1500 = 1500 JPYC）
   */
  approveJPYC: (spender: `0x${string}`, amountJPYC: number) => Promise<void>;
  /** approve 実行中フラグ */
  approving: boolean;
  /** approve エラーメッセージ（null = エラーなし） */
  approveError: string | null;
}

/**
 * loginMethod と provider 状態からトランザクションモードを決定する。
 * 将来的なモード追加（例: AA + paymaster）もここで一元管理する。
 */
function resolveTxMode(loginMethod: string | null): TxMode {
  return loginMethod === 'social' ? 'aa' : 'wallet';
}

const JPYC_ADDRESS = CONTRACT_ADDRESSES.jpycToken as Address;

export function useTxMode(): UseTxModeReturn {
  const loginMethod = useUserStore((s) => s.loginMethod);
  const mode = resolveTxMode(loginMethod);

  // AA モード用（ソーシャルログイン時）
  const { sendUserOp, status: aaStatus, error: aaError } = useAaTransaction();

  // 通常ウォレットモード用
  const { approve: wagmiApprove, isApproving: wagmiApproving, approveError: wagmiError } = useJPYCApprove();

  // AA モードの approve 中フラグを useState で管理（sendUserOp は status で判断）
  const [aaApproving, setAaApproving] = useState(false);

  const approveJPYC = async (spender: `0x${string}`, amountJPYC: number): Promise<void> => {
    if (!isAddress(spender)) {
      throw new Error(`approve 先アドレスが不正です: ${spender}`);
    }

    if (mode === 'aa') {
      // AA モード: UserOperation で JPYC approve を送信
      setAaApproving(true);
      try {
        // JPYC は 18 decimals
        const amountMinor = parseUnits(amountJPYC.toString(), 18);
        const result = await sendUserOp([
          {
            to:    JPYC_ADDRESS,
            data:  encodeJpycApprove(spender, amountMinor),
            value: 0n,
          },
        ]);
        if (!result) {
          throw new Error(aaError ?? 'AA approve に失敗しました。');
        }
      } finally {
        setAaApproving(false);
      }
    } else {
      // 通常ウォレットモード: wagmi writeContract で approve
      await wagmiApprove(spender, amountJPYC);
    }
  };

  const approving  = mode === 'aa' ? (aaApproving || aaStatus === 'sending') : wagmiApproving;
  const approveError = mode === 'aa' ? aaError : wagmiError;

  return { mode, approveJPYC, approving, approveError };
}
