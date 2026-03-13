'use client';

/**
 * useJPYCBalance — JPYC ERC-20 オンチェーン残高を取得するフック
 * useJPYCApprove — JPYC の approve トランザクションを送信するフック
 * useJPYCTransfer — JPYC の transfer トランザクションを送信するフック
 *
 * wagmi の useReadContract / useWriteContract を使用。
 * コントラクトアドレスは config.ts の CONTRACT_ADDRESSES.jpycToken。
 */

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { useConfig } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../services/config';

// ---------------------------------------------------------------------------
// ERC-20 最小 ABI（balanceOf + approve）
// ---------------------------------------------------------------------------
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const JPYC_ADDRESS = CONTRACT_ADDRESSES.jpycToken as `0x${string}`;

// ---------------------------------------------------------------------------
// useJPYCBalance
// ---------------------------------------------------------------------------

export interface UseJPYCBalanceReturn {
  /** JPYC 残高（人間が読める単位、例: "1500.00"） */
  balance: string | null;
  /** 残高（minor = 小数点以下なしの最小単位、円相当） */
  balanceMinor: bigint | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useJPYCBalance(address: `0x${string}` | null): UseJPYCBalanceReturn {
  const { data: decimals } = useReadContract({
    address: JPYC_ADDRESS,
    abi:     ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address },
  });

  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: JPYC_ADDRESS,
    abi:     ERC20_ABI,
    functionName: 'balanceOf',
    args:    address ? [address] : undefined,
    query:   { enabled: !!address },
  });

  const dec = decimals ?? 18;
  const balance      = rawBalance != null ? formatUnits(rawBalance, dec) : null;
  const balanceMinor = rawBalance != null ? rawBalance / BigInt(10 ** Math.max(0, Number(dec) - 2)) : null;

  return { balance, balanceMinor, isLoading, refetch };
}

// ---------------------------------------------------------------------------
// useJPYCApprove
// ---------------------------------------------------------------------------

export interface UseJPYCApproveReturn {
  /** approve トランザクションを送信する */
  approve: (spender: `0x${string}`, amountJPYC: number) => Promise<void>;
  /** approve 送信中フラグ */
  isApproving: boolean;
  /** tx 確認待ちフラグ */
  isConfirming: boolean;
  /** approve 完了フラグ */
  isApproved: boolean;
  /** エラーメッセージ */
  approveError: string | null;
}

export function useJPYCApprove(): UseJPYCApproveReturn {
  const config = useConfig();
  const { writeContractAsync, data: txHash, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const approve = async (spender: `0x${string}`, amountJPYC: number) => {
    // JPYC は 18 decimals
    const amount = parseUnits(amountJPYC.toString(), 18);
    const hash = await writeContractAsync({
      address:      JPYC_ADDRESS,
      abi:          ERC20_ABI,
      functionName: 'approve',
      args:         [spender, amount],
    });
    await waitForTransactionReceipt(config, { hash });
  };

  const approveError = writeError ? writeError.message : null;

  return {
    approve,
    isApproving:  isPending,
    isConfirming,
    isApproved,
    approveError,
  };
}

// ---------------------------------------------------------------------------
// useJPYCTransfer
// ---------------------------------------------------------------------------

export interface UseJPYCTransferReturn {
  /** transfer トランザクションを送信する（amountJPYC は "123.45" 形式の文字列） */
  transferJpyc: (to: `0x${string}`, amountJPYC: string) => Promise<`0x${string}`>;
  isTransferring: boolean;
  isConfirming: boolean;
  isTransferred: boolean;
  transferError: string | null;
}

export function useJPYCTransfer(): UseJPYCTransferReturn {
  const config = useConfig();
  const { writeContractAsync, data: txHash, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isTransferred } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const transferJpyc = async (to: `0x${string}`, amountJPYC: string) => {
    const amount = parseUnits(amountJPYC, 18);
    const hash = await writeContractAsync({
      address: JPYC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    });
    await waitForTransactionReceipt(config, { hash });
    return hash;
  };

  const transferError = writeError ? writeError.message : null;

  return {
    transferJpyc,
    isTransferring: isPending,
    isConfirming,
    isTransferred,
    transferError,
  };
}
