'use client';

/**
 * useRevenueMarket
 * 収益権市場（出品 / 購入 / 取消 / 再実行）を管理する。
 * 既存の配当ダッシュボードとは分離し、/revenue ページ内で追加表示する。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { useAccount, useConfig, useWriteContract } from 'wagmi';
import type { Address } from 'viem';

import { createNodeStayClient } from '../services/nodestay';
import { useUserStore } from '../stores/user.store';
import { useAaTransaction } from './useAaTransaction';
import { resolveTxMode } from './txMode';
import { useUserState } from './useUserState';
import {
  encodeJpycTransfer,
  encodeRevenueSafeTransferFrom,
} from '../services/aa/encodeMarketplaceCalls';
import type { RevenueRight } from './useRevenueDashboard';
import { CHAIN_CONFIG } from '../services/config';

const ERC1155_ABI = [
  {
    name: 'safeTransferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface RevenueMarketConfig {
  revenueRightAddress: `0x${string}` | null;
  jpycTokenAddress: `0x${string}` | null;
  escrowWallet: `0x${string}` | null;
  chainEnabled: boolean;
}

export interface RevenueMarketListing {
  id: string;
  status: 'ACTIVE' | 'SOLD' | 'SETTLING' | 'CANCELLED';
  active: boolean;
  priceJpyc: string;
  expiryAt: string | null;
  soldAt: string | null;
  createdAt: string;
  sellerUserId: string | null;
  sellerWalletAddress: `0x${string}` | null;
  buyerUserId: string | null;
  buyerWalletAddress: `0x${string}` | null;
  revenueRight: {
    id: string;
    revenueProgramId: string;
    onchainProgramId: string | null;
    amount1155: string | null;
    status: string;
    machineId: string;
    nodeId: string;
    machineName: string;
    venueName: string;
    settlementCycle: string;
    startAt: string;
    endAt: string;
  };
}

export interface RevenueMarketSuccess {
  message: string;
  txHashes: string[];
}

interface UseRevenueMarketParams {
  rights: RevenueRight[];
  refreshDashboard: () => Promise<void>;
}

interface UseRevenueMarketReturn {
  config: RevenueMarketConfig | null;
  publicListings: RevenueMarketListing[];
  myListings: RevenueMarketListing[];
  loading: boolean;
  loadingError: string | null;
  actionPending: boolean;
  actionError: string | null;
  success: RevenueMarketSuccess | null;
  reload: () => Promise<void>;
  createListing: (params: {
    revenueRightId: string;
    priceJpyc: string;
    expiryAtIso?: string;
  }) => Promise<void>;
  cancelListing: (listingId: string) => Promise<void>;
  buyListing: (listingId: string) => Promise<void>;
  settleListing: (listingId: string) => Promise<void>;
  explorerTxUrl: (txHash: string) => string;
  clearActionState: () => void;
}

function toAddressOrNull(value: string | null | undefined): `0x${string}` | null {
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

function isConnectorNotConnectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connector not connected/i.test(message);
}

export function useRevenueMarket(params: UseRevenueMarketParams): UseRevenueMarketReturn {
  const { walletAddress: authWalletAddress, onchainWalletAddress } = useUserState();
  const loginMethod = useUserStore((s) => s.loginMethod);
  const { address: connectedAddress, isConnected } = useAccount();
  const mode = resolveTxMode(loginMethod, isConnected);
  const configWagmi = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { sendUserOp, error: aaError } = useAaTransaction();

  const [config, setConfig] = useState<RevenueMarketConfig | null>(null);
  const [publicListings, setPublicListings] = useState<RevenueMarketListing[]>([]);
  const [myListings, setMyListings] = useState<RevenueMarketListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RevenueMarketSuccess | null>(null);

  const client = useMemo(() => createNodeStayClient(), []);

  const explorerTxUrl = useCallback((txHash: string) => {
    const base = CHAIN_CONFIG.blockExplorerUrl.replace(/\/+$/, '');
    return `${base}/tx/${txHash}`;
  }, []);

  const clearActionState = useCallback(() => {
    setActionError(null);
    setSuccess(null);
  }, []);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);
    try {
      const [marketConfig, marketRows, myRows] = await Promise.all([
        client.getRevenueMarketConfig(),
        client.listRevenueMarketListings(),
        authWalletAddress ? client.listMyRevenueMarketListings() : Promise.resolve([]),
      ]);

      const nextConfig: RevenueMarketConfig = {
        revenueRightAddress: toAddressOrNull(marketConfig.revenueRightAddress),
        jpycTokenAddress: toAddressOrNull(marketConfig.jpycTokenAddress),
        escrowWallet: toAddressOrNull(marketConfig.escrowWallet),
        chainEnabled: !!marketConfig.chainEnabled,
      };
      setConfig(nextConfig);
      setPublicListings(marketRows as RevenueMarketListing[]);
      setMyListings(myRows as RevenueMarketListing[]);
    } catch (e) {
      setLoadingError(e instanceof Error ? e.message : '収益権市場の読み込みに失敗しました');
      setPublicListings([]);
      setMyListings([]);
    } finally {
      setLoading(false);
    }
  }, [client, authWalletAddress]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const sendRevenueTransferToEscrow = useCallback(async (input: {
    revenueRightAddress: `0x${string}`;
    escrowWallet: `0x${string}`;
    onchainProgramId: string;
    amount1155: string;
  }): Promise<`0x${string}`> => {
    const sender = (onchainWalletAddress ?? connectedAddress) as `0x${string}` | null;
    if (!sender) {
      throw new Error('ウォレット情報が見つかりません。再ログインしてください。');
    }

    const callData = encodeRevenueSafeTransferFrom(
      sender,
      input.escrowWallet,
      BigInt(input.onchainProgramId),
      BigInt(input.amount1155),
    );

    const sendViaAa = async () => {
      const result = await sendUserOp([
        { to: input.revenueRightAddress, data: callData, value: 0n },
      ]);
      if (!result?.txHash) {
        throw new Error(aaError ?? 'AA での収益権移転トランザクション送信に失敗しました');
      }
      return result.txHash;
    };

    if (mode === 'aa') {
      return await sendViaAa();
    }

    try {
      const from = connectedAddress ?? sender;
      if (!from) {
        throw new Error('ウォレットが未接続のため出品できません。');
      }
      const txHash = await writeContractAsync({
        address: input.revenueRightAddress,
        abi: ERC1155_ABI,
        functionName: 'safeTransferFrom',
        args: [from, input.escrowWallet, BigInt(input.onchainProgramId), BigInt(input.amount1155), '0x'],
      });
      await waitForTransactionReceipt(configWagmi, { hash: txHash });
      return txHash;
    } catch (e) {
      if (loginMethod !== 'wallet' && isConnectorNotConnectedError(e)) {
        return await sendViaAa();
      }
      throw e;
    }
  }, [aaError, configWagmi, connectedAddress, loginMethod, mode, onchainWalletAddress, sendUserOp, writeContractAsync]);

  const sendJpycPayment = useCallback(async (input: {
    jpycTokenAddress: `0x${string}`;
    sellerWallet: `0x${string}`;
    amountJpyc: string;
  }): Promise<`0x${string}`> => {
    const amount = BigInt(input.amountJpyc);

    const sendViaAa = async () => {
      const result = await sendUserOp([
        {
          to: input.jpycTokenAddress,
          data: encodeJpycTransfer(input.sellerWallet, amount),
          value: 0n,
        },
      ]);
      if (!result?.txHash) {
        throw new Error(aaError ?? 'AA での JPYC 送金に失敗しました');
      }
      return result.txHash;
    };

    if (mode === 'aa') {
      return await sendViaAa();
    }

    try {
      const txHash = await writeContractAsync({
        address: input.jpycTokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [input.sellerWallet, amount],
      });
      await waitForTransactionReceipt(configWagmi, { hash: txHash });
      return txHash;
    } catch (e) {
      if (loginMethod !== 'wallet' && isConnectorNotConnectedError(e)) {
        return await sendViaAa();
      }
      throw e;
    }
  }, [aaError, configWagmi, loginMethod, mode, sendUserOp, writeContractAsync]);

  const createListing = useCallback(async (input: {
    revenueRightId: string;
    priceJpyc: string;
    expiryAtIso?: string;
  }) => {
    setActionPending(true);
    setActionError(null);
    setSuccess(null);

    try {
      if (!authWalletAddress) {
        throw new Error('ログイン中のウォレットが見つかりません。');
      }
      if (!onchainWalletAddress) {
        throw new Error('オンチェーン実行ウォレットが見つかりません。再ログインしてください。');
      }
      if (!config?.chainEnabled || !config.revenueRightAddress || !config.escrowWallet) {
        throw new Error('収益権市場のオンチェーン設定が未完了です。管理者に連絡してください。');
      }

      const right = params.rights.find((r) => r.id === input.revenueRightId);
      if (!right) {
        throw new Error('出品対象の収益権が見つかりません。');
      }
      if (!right.onchainProgramId || !/^\d+$/.test(right.onchainProgramId)) {
        throw new Error('オンチェーンProgram IDが未設定のため出品できません。');
      }
      if (!/^\d+$/.test(input.priceJpyc) || BigInt(input.priceJpyc) <= 0n) {
        throw new Error('出品価格は 1 以上の整数で入力してください。');
      }

      const amount = BigInt(Math.max(0, Math.trunc(right.holdAmount))).toString();
      if (BigInt(amount) <= 0n) {
        throw new Error('出品可能な保有数量がありません。');
      }

      const transferTxHash = await sendRevenueTransferToEscrow({
        revenueRightAddress: config.revenueRightAddress,
        escrowWallet: config.escrowWallet,
        onchainProgramId: right.onchainProgramId,
        amount1155: amount,
      });

      await client.createRevenueMarketListing({
        revenueRightId: right.id,
        priceJpyc: input.priceJpyc,
        expiryAt: input.expiryAtIso,
        onchainTxHash: transferTxHash,
        walletAddress: onchainWalletAddress,
      });

      setSuccess({
        message: '収益権を市場に出品しました。',
        txHashes: [transferTxHash],
      });
      await Promise.all([loadListings(), params.refreshDashboard()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '出品に失敗しました');
    } finally {
      setActionPending(false);
    }
  }, [client, config, loadListings, params, sendRevenueTransferToEscrow, authWalletAddress, onchainWalletAddress]);

  const cancelListing = useCallback(async (listingId: string) => {
    setActionPending(true);
    setActionError(null);
    setSuccess(null);

    try {
      const res = await client.cancelRevenueMarketListing(listingId, {
        walletAddress: onchainWalletAddress ?? undefined,
      });
      setSuccess({
        message: '出品を取り下げました。',
        txHashes: [res.transferTxHash],
      });
      await Promise.all([loadListings(), params.refreshDashboard()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '取り下げに失敗しました');
    } finally {
      setActionPending(false);
    }
  }, [client, loadListings, params, onchainWalletAddress]);

  const buyListing = useCallback(async (listingId: string) => {
    setActionPending(true);
    setActionError(null);
    setSuccess(null);

    try {
      if (!config?.jpycTokenAddress) {
        throw new Error('JPYCトークン設定が未完了です。');
      }
      const listing = publicListings.find((row) => row.id === listingId);
      if (!listing) {
        throw new Error('対象の出品が見つかりません。');
      }
      if (!listing.sellerWalletAddress) {
        throw new Error('出品者ウォレット情報が不足しています。');
      }

      const paymentTxHash = await sendJpycPayment({
        jpycTokenAddress: config.jpycTokenAddress,
        sellerWallet: listing.sellerWalletAddress,
        amountJpyc: listing.priceJpyc,
      });

      const result = await client.buyRevenueMarketListing(listingId, {
        onchainPaymentTxHash: paymentTxHash,
        walletAddress: onchainWalletAddress ?? undefined,
      });

      setSuccess({
        message: '収益権の購入処理が完了しました。',
        txHashes: [paymentTxHash, result.transferTxHash].filter(Boolean),
      });
      await Promise.all([loadListings(), params.refreshDashboard()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '購入に失敗しました');
    } finally {
      setActionPending(false);
    }
  }, [client, config, loadListings, params, publicListings, sendJpycPayment, onchainWalletAddress]);

  const settleListing = useCallback(async (listingId: string) => {
    setActionPending(true);
    setActionError(null);
    setSuccess(null);

    try {
      const result = await client.settleRevenueMarketListing(listingId, {
        walletAddress: onchainWalletAddress ?? undefined,
      });
      setSuccess({
        message: '受渡再実行が完了しました。',
        txHashes: [result.transferTxHash].filter((v): v is string => !!v),
      });
      await Promise.all([loadListings(), params.refreshDashboard()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '受渡再実行に失敗しました');
    } finally {
      setActionPending(false);
    }
  }, [client, loadListings, params, onchainWalletAddress]);

  return {
    config,
    publicListings,
    myListings,
    loading,
    loadingError,
    actionPending,
    actionError,
    success,
    reload: loadListings,
    createListing,
    cancelListing,
    buyListing,
    settleListing,
    explorerTxUrl,
    clearActionState,
  };
}
