'use client';

/**
 * AA トランザクションフック
 * UserOperation を送信し、トランザクションの完了を待機する。
 */

import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import { buildKernelClient } from '../services/aa/kernelClient';
import { Web3AuthService } from '../services/web3auth.service';

export type AaTxStatus = 'idle' | 'sending' | 'success' | 'error';

export interface AaCall {
  to: Address;
  data: Hex;
  value?: bigint;
}

export interface UseAaTransactionReturn {
  sendUserOp: (calls: AaCall[]) => Promise<{ userOpHash: Hex; txHash: Hex } | null>;
  status: AaTxStatus;
  userOpHash: Hex | null;
  txHash: Hex | null;
  error: string | null;
}

export function useAaTransaction(): UseAaTransactionReturn {
  const [status, setStatus] = useState<AaTxStatus>('idle');
  const [userOpHash, setUserOpHash] = useState<Hex | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendUserOp = useCallback(async (calls: AaCall[]) => {
    setStatus('sending');
    setError(null);
    setUserOpHash(null);
    setTxHash(null);

    try {
      const provider = Web3AuthService.getConnectedProvider();
      if (!provider) {
        throw new Error('ソーシャルウォレットのセッションが見つかりません。再ログインしてください。');
      }

      const { kernelClient } = await buildKernelClient(provider);

      const normalizedCalls = calls.map((call) => ({
        to: call.to,
        data: call.data,
        value: call.value ?? 0n,
      }));

      const hash = await kernelClient.sendUserOperation({
        calls: normalizedCalls,
      });
      setUserOpHash(hash);

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash,
      });
      const confirmedTxHash = receipt.receipt.transactionHash;
      setTxHash(confirmedTxHash);
      setStatus('success');
      return { userOpHash: hash, txHash: confirmedTxHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'UserOperation の送信に失敗しました。';
      setError(msg);
      setStatus('error');
      return null;
    }
  }, []);

  return {
    sendUserOp,
    status,
    userOpHash,
    txHash,
    error,
  };
}
