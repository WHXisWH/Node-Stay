'use client';

/**
 * useUsageRightDetail: 利用権詳細ページ Controller（SPEC §8）。
 * 利用権の全詳細情報・QRモーダル・譲渡フォーム・キャンセル処理を保持。
 * 実データは API から取得し、mock データは使用しない。
 */

import { useCallback, useEffect, useState } from 'react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { encodeFunctionData, isAddress } from 'viem';
import { useAccount, useConfig, useWriteContract } from 'wagmi';
import { createNodeStayClient } from '../services/nodestay';
import { CONTRACT_ADDRESSES } from '../services/config';
import { useUserStore } from '../stores/user.store';
import { useAaTransaction } from './useAaTransaction';
import type { UsageRightStatus } from './usePassesPage';
import { resolveTxMode } from './txMode';

export interface UsageRightDetail {
  usageRightId: string;
  onchainTokenId: string | null;
  planName: string;
  planDurationMinutes: number;
  venueName: string;
  venueId: string;
  venueAddress: string;
  status: UsageRightStatus;
  remainingMinutes: number;
  purchasedAt: string;
  expiresAt: string;
  transferCutoff: string | null;
  transferable: boolean;
  transferCount: number;
  maxTransferCount: number;
  depositAmountMinor: number;
  depositStatus: 'NONE' | 'HELD' | 'PARTIALLY_CAPTURED' | 'RELEASED';
  basePriceMinor: number;
  txHash: string | null;
}

export interface TransferInput {
  toWalletAddress: string;
}

export interface UseUsageRightDetailReturn {
  right: UsageRightDetail | null;
  notFound: boolean;
  loading: boolean;
  // QR モーダル
  showQr: boolean;
  setShowQr: (v: boolean) => void;
  // 譲渡フォーム
  showTransfer: boolean;
  setShowTransfer: (v: boolean) => void;
  transferInput: TransferInput;
  setTransferInput: (v: TransferInput) => void;
  transferring: boolean;
  transferError: string | null;
  transferSuccess: boolean;
  handleTransfer: () => Promise<void>;
  // キャンセル
  cancelling: boolean;
  cancelError: string | null;
  cancelSuccess: boolean;
  handleCancel: () => Promise<void>;
}

const USAGE_RIGHT_ADDRESS = CONTRACT_ADDRESSES.usageRight as `0x${string}`;

const ERC721_SAFE_TRANSFER_ABI = [
  {
    name: 'safeTransferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// API レスポンスの status 文字列を UsageRightStatus に正規化する
function toUsageRightStatus(s: string): UsageRightStatus {
  switch (s) {
    case 'ACTIVE':
    case 'MINTED':
      return 'ACTIVE';
    case 'IN_USE':
    case 'CHECKED_IN':
    case 'LOCKED':
      return 'IN_USE';
    case 'LISTED':
      return 'LISTED';
    case 'CONSUMED':
      return 'CONSUMED';
    case 'TRANSFERRED':
      return 'TRANSFERRED';
    case 'PENDING':
      return 'PENDING';
    case 'EXPIRED':
    case 'CANCELLED':
    default:
      return 'EXPIRED';
  }
}

function toValidIso(value: string | null | undefined): string {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString();
}

function toMinorFromPriceJpyc(priceJpyc: string | undefined): number {
  if (!priceJpyc) return 0;
  const n = Number(priceJpyc);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function parseApiErrorMessage(error: unknown): string {
  const fallback = '譲渡処理に失敗しました。しばらく経ってから再試行してください。';
  const raw = error instanceof Error ? error.message : '';
  if (!raw) return fallback;

  // API エラーの JSON 本文（{"message":"..."}）を優先表示する。
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    const jsonText = raw.slice(jsonStart);
    try {
      const parsed = JSON.parse(jsonText) as { message?: string };
      if (parsed.message && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // JSON でない場合は下の分岐で処理する。
    }
  }

  if (raw.includes('403')) return '譲渡条件を満たしていないため実行できません。譲渡期限・回数をご確認ください。';
  if (raw.includes('404')) return '利用権が見つかりません。ページを更新してください。';
  if (raw.includes('401')) return 'ログイン状態が無効です。再ログインしてください。';
  return fallback;
}

function parseTransferErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw) return '譲渡処理に失敗しました。しばらく経ってから再試行してください。';
  if (/user rejected|rejected the request/i.test(raw)) {
    return '署名がキャンセルされました。';
  }
  if (/connector not connected/i.test(raw)) {
    return 'ウォレット接続が切れています。再ログインしてください。';
  }
  if (/insufficient approval|ERC721InsufficientApproval/i.test(raw)) {
    return 'NFT の譲渡権限が不足しています。所有者アカウントで再実行してください。';
  }
  return parseApiErrorMessage(error);
}

function isConnectorNotConnectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connector not connected/i.test(message);
}

export function useUsageRightDetail(id: string | undefined): UseUsageRightDetailReturn {
  const loginMethod = useUserStore((s) => s.loginMethod);
  const walletAddress = useUserStore((s) => s.walletAddress);
  const { isConnected, address: connectedWalletAddress } = useAccount();
  const mode = resolveTxMode(loginMethod, isConnected);
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { sendUserOp } = useAaTransaction();

  const [right, setRight] = useState<UsageRightDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  // QR モーダル
  const [showQr, setShowQr] = useState(false);

  // 譲渡
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferInput, setTransferInput] = useState<TransferInput>({ toWalletAddress: '' });
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState(false);

  // キャンセル
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // API から利用権詳細を取得する
  const loadDetail = useCallback(async () => {
    if (!id) {
      setRight(null);
      setNotFound(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createNodeStayClient();
      const data = await client.getUsageRight(id);
      const raw = data as typeof data & {
        startAt?: string | null;
        endAt?: string | null;
        remainingMinutes?: number;
        maxTransferCount?: number;
        usageProduct?: {
          productName?: string;
          priceJpyc?: string;
          venueId?: string;
          venue?: { id?: string; name?: string; address?: string | null } | null;
        };
      };

      const usageProduct = data.usageProduct;
      const durationMinutes = Number.isFinite(usageProduct.durationMinutes)
        ? Math.max(0, usageProduct.durationMinutes)
        : 0;
      const purchasedAt = toValidIso(raw.startAt);
      const expiresAt = toValidIso(raw.endAt);
      const remainingByEndAt = expiresAt
        ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000))
        : durationMinutes;
      const remainingMinutes = typeof raw.remainingMinutes === 'number' && Number.isFinite(raw.remainingMinutes)
        ? Math.max(0, raw.remainingMinutes)
        : remainingByEndAt;
      const maxTransferCount = typeof raw.maxTransferCount === 'number' && Number.isFinite(raw.maxTransferCount)
        ? Math.max(0, raw.maxTransferCount)
        : (data.transferable ? Math.max(1, data.transferCount + 1) : 0);
      const basePriceMinor = Number.isFinite(usageProduct.priceMinor)
        ? Math.max(0, usageProduct.priceMinor)
        : toMinorFromPriceJpyc(raw.usageProduct?.priceJpyc);

      const mapped: UsageRightDetail = {
        usageRightId: data.id,
        onchainTokenId: data.onchainTokenId,
        planName: usageProduct.name || raw.usageProduct?.productName || '利用権',
        planDurationMinutes: durationMinutes,
        venueName: raw.usageProduct?.venue?.name || '店舗',
        venueId: raw.usageProduct?.venueId || raw.usageProduct?.venue?.id || usageProduct.id,
        venueAddress: raw.usageProduct?.venue?.address || '',
        status: toUsageRightStatus(data.status),
        remainingMinutes,
        purchasedAt,
        expiresAt,
        transferCutoff: data.transferCutoff,
        transferable: data.transferable,
        transferCount: data.transferCount,
        maxTransferCount,
        depositAmountMinor: Math.max(0, usageProduct.depositRequiredMinor ?? 0),
        depositStatus: 'NONE',
        basePriceMinor,
        txHash: data.onchainTxHash,
      };

      setRight(mapped);
      setNotFound(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('404')) {
        setNotFound(true);
        setRight(null);
      } else {
        // その他のエラーは not found として扱わず null のみセットする
        setRight(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleTransfer = async () => {
    const addr = transferInput.toWalletAddress.trim();
    if (!isAddress(addr)) {
      setTransferError('有効なウォレットアドレス（0x...）を入力してください');
      return;
    }
    if (!id) return;
    if (!right?.onchainTokenId) {
      setTransferError('オンチェーン Token ID が未設定のため譲渡できません。');
      return;
    }
    const fromWallet = (connectedWalletAddress ?? walletAddress ?? '').trim();
    if (!isAddress(fromWallet)) {
      setTransferError('ウォレット情報が取得できません。再ログインしてください。');
      return;
    }
    if (fromWallet.toLowerCase() === addr.toLowerCase()) {
      setTransferError('譲渡先ウォレットが現在所有者と同一です。');
      return;
    }
    if (right?.transferCutoff) {
      const cutoffMs = new Date(right.transferCutoff).getTime();
      if (Number.isFinite(cutoffMs) && Date.now() >= cutoffMs) {
        setTransferError('譲渡期限を過ぎているため、この利用権は譲渡できません。');
        return;
      }
    }

    setTransferring(true);
    setTransferError(null);
    try {
      const tokenId = BigInt(right.onchainTokenId);
      const sendViaAa = async (): Promise<`0x${string}`> => {
        const transferData = encodeFunctionData({
          abi: ERC721_SAFE_TRANSFER_ABI,
          functionName: 'safeTransferFrom',
          args: [fromWallet as `0x${string}`, addr as `0x${string}`, tokenId],
        });
        const result = await sendUserOp([
          {
            to: USAGE_RIGHT_ADDRESS,
            data: transferData,
            value: 0n,
          },
        ]);
        if (!result?.txHash) {
          throw new Error('AA での譲渡トランザクション送信に失敗しました。');
        }
        return result.txHash;
      };

      let onchainTxHash: `0x${string}`;
      if (mode === 'aa') {
        onchainTxHash = await sendViaAa();
      } else {
        try {
          const txHash = await writeContractAsync({
            address: USAGE_RIGHT_ADDRESS,
            abi: ERC721_SAFE_TRANSFER_ABI,
            functionName: 'safeTransferFrom',
            args: [fromWallet as `0x${string}`, addr as `0x${string}`, tokenId],
          });
          await waitForTransactionReceipt(config, { hash: txHash });
          onchainTxHash = txHash;
        } catch (walletError) {
          if (loginMethod !== 'wallet' && isConnectorNotConnectedError(walletError)) {
            onchainTxHash = await sendViaAa();
          } else {
            throw walletError;
          }
        }
      }

      const client = createNodeStayClient();
      await client.transferUsageRight(id, addr, onchainTxHash, crypto.randomUUID());
      setTransferSuccess(true);
      setShowTransfer(false);
      // 譲渡成功後に詳細を再取得して状態を同期する
      await loadDetail();
    } catch (error) {
      setTransferError(parseTransferErrorMessage(error));
    } finally {
      setTransferring(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;

    setCancelling(true);
    setCancelError(null);
    try {
      const client = createNodeStayClient();
      await client.cancelUsageRight(id);
      setCancelSuccess(true);
      // キャンセル成功後に詳細を再取得して状態を同期する
      await loadDetail();
    } catch {
      setCancelError('キャンセル処理に失敗しました。しばらく経ってから再試行してください。');
    } finally {
      setCancelling(false);
    }
  };

  return {
    right,
    notFound,
    loading,
    showQr,
    setShowQr,
    showTransfer,
    setShowTransfer,
    transferInput,
    setTransferInput,
    transferring,
    transferError,
    transferSuccess,
    handleTransfer,
    cancelling,
    cancelError,
    cancelSuccess,
    handleCancel,
  };
}
