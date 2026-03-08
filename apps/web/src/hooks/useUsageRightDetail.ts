'use client';

/**
 * useUsageRightDetail: 利用権詳細ページ Controller（SPEC §8）。
 * 利用権の全詳細情報・QRモーダル・譲渡フォーム・キャンセル処理を保持。
 * 実データは API から取得し、mock データは使用しない。
 */

import { useCallback, useEffect, useState } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import type { UsageRightStatus } from './usePassesPage';

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

// API レスポンスの status 文字列を UsageRightStatus に正規化する
function toUsageRightStatus(s: string): UsageRightStatus {
  const valid: UsageRightStatus[] = ['ACTIVE', 'IN_USE', 'CONSUMED', 'EXPIRED', 'TRANSFERRED', 'PENDING'];
  return valid.includes(s as UsageRightStatus) ? (s as UsageRightStatus) : 'EXPIRED';
}

export function useUsageRightDetail(id: string | undefined): UseUsageRightDetailReturn {
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

      const mapped: UsageRightDetail = {
        usageRightId: data.id,
        onchainTokenId: data.onchainTokenId,
        planName: data.usageProduct.name,
        planDurationMinutes: data.usageProduct.durationMinutes,
        // venue 情報は usageProduct から取得できないため空文字で代替する
        venueName: '',
        venueId: data.usageProduct.id,
        venueAddress: '',
        status: toUsageRightStatus(data.status),
        remainingMinutes: data.usageProduct.durationMinutes,
        purchasedAt: '',
        expiresAt: '',
        transferCutoff: data.transferCutoff,
        transferable: data.transferable,
        transferCount: data.transferCount,
        maxTransferCount: 0,
        depositAmountMinor: data.usageProduct.depositRequiredMinor,
        depositStatus: 'NONE',
        basePriceMinor: data.usageProduct.priceMinor,
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
    if (!addr.startsWith('0x') || addr.length !== 42) {
      setTransferError('有効なウォレットアドレス（0x...）を入力してください');
      return;
    }
    if (!id) return;

    setTransferring(true);
    setTransferError(null);
    try {
      const client = createNodeStayClient();
      // 譲渡先ウォレットアドレスを新所有者 ID として渡す
      await client.transferUsageRight(id, addr, crypto.randomUUID());
      setTransferSuccess(true);
      setShowTransfer(false);
      // 譲渡成功後に詳細を再取得して状態を同期する
      await loadDetail();
    } catch {
      setTransferError('譲渡処理に失敗しました。しばらく経ってから再試行してください。');
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
