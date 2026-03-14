/**
 * useVenueDetailPage: 店舗詳細 Controller（SPEC §8）。
 * venue.store は読み取り専用で扱い、VenueService / UsageRightService を呼び出す。
 * 購入フローは useTxMode に統一し、ソーシャル（AA）/ ウォレットの分岐をこのファイル内に持たない。
 * View は本 Hook の戻り値のみで描画する。
 */

import { useCallback, useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { useUserState } from './useUserState';
import { useVenueStore } from '../stores/venue.store';
import { VenueService } from '../services/venue.service';
import { CONTRACT_ADDRESSES } from '../services/config';
import { UsageRightService } from '../services/usageRight.service';
import { useTxMode } from './useTxMode';
import type { VenueListItem, PlanListItem } from '../models/venue.model';

export interface UseVenueDetailPageReturn {
  venue: VenueListItem | null;
  plans: PlanListItem[];
  loading: boolean;
  error: boolean;
  refresh: () => void;
  selectedPlan: PlanListItem | null;
  setSelectedPlan: (p: PlanListItem | null) => void;
  purchasing: boolean;
  approving: boolean;
  purchaseError: string | null;
  needsApproval: boolean;
  purchaseSuccess: boolean;
  clearPurchaseSuccess: () => void;
  mintStatus: 'idle' | 'pending' | 'confirmed' | 'timeout';
  mintedTokenId: string | null;
  handlePurchase: () => Promise<void>;
  // JPYC残高チェック関連
  balance: number | null;
  insufficientBalance: boolean;
  requiredAmount: number;
}

export function useVenueDetailPage(venueId: string | undefined): UseVenueDetailPageReturn {
  const {
    currentVenue,
    plans,
    plansLoading,
    plansError,
  } = useVenueStore();

  // 認証用アドレス（EOA）とオンチェーン送信用アドレス（AA/EOA）を分離する
  const { walletAddress, onchainWalletAddress, balance: balanceMinor } = useUserState();
  // 残高を数値（minor 単位：1/100 JPYC）として抽出
  const balance = balanceMinor;

  const [selectedPlan, setSelectedPlan] = useState<PlanListItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<'idle' | 'pending' | 'confirmed' | 'timeout'>('idle');
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);

  // ソーシャル（AA）/ ウォレット を統一的に扱うトランザクションルーター
  const { approveJPYC, approving, approveError } = useTxMode();

  const settlementAddress = CONTRACT_ADDRESSES.settlement;
  // ウォレットアドレスがあり、かつ settlement アドレスが有効な場合に approve が必要
  const needsApproval = isAddress(settlementAddress) && !!onchainWalletAddress;

  // 購入に必要な合計金額（基本料金 + デポジット）
  const requiredAmount = selectedPlan
    ? selectedPlan.basePriceMinor + selectedPlan.depositRequiredMinor
    : 0;

  // 残高不足かどうかを判定
  const insufficientBalance = balance !== null && requiredAmount > 0 && balance < requiredAmount;

  const clearPurchaseSuccess = useCallback(() => {
    setPurchaseSuccess(false);
  }, []);

  useEffect(() => {
    if (venueId) VenueService.loadVenueDetail(venueId);
  }, [venueId]);

  const handlePurchase = async () => {
    if (!selectedPlan || !venueId) return;

    // 残高不足チェック
    if (insufficientBalance) {
      const shortage = ((requiredAmount - (balance ?? 0)) / 100).toLocaleString('ja-JP');
      setPurchaseError(`JPYC 残高が不足しています（あと ${shortage} JPYC 必要）`);
      return;
    }

    setPurchaseError(null);
    setPurchaseSuccess(false);
    setMintStatus('idle');
    setMintedTokenId(null);
    setPurchasing(true);
    try {
      if (!onchainWalletAddress) {
        throw new Error('オンチェーン送信用ウォレットが未初期化です。AAウォレットを初期化してください。');
      }
      if (needsApproval) {
        // useTxMode が loginMethod を見て AA / wagmi を自動選択
        const totalMinor = selectedPlan.basePriceMinor + selectedPlan.depositRequiredMinor;
        const totalJPYC  = totalMinor / 100;
        await approveJPYC(settlementAddress as `0x${string}`, totalJPYC);
      }

      const purchaseResult = await UsageRightService.purchase(
        {
          productId:    selectedPlan.productId,
          ownerUserId:  walletAddress ?? undefined,
          buyerWallet:  onchainWalletAddress,
        },
        `purchase-${selectedPlan.productId}-${Date.now()}`
      );
      setPurchaseSuccess(true);
      setSelectedPlan(null);
      setMintStatus('pending');

      // オンチェーンのミント完了を非同期で待機（UI 表示用）
      void (async () => {
        try {
          const tokenId = await UsageRightService.waitForOnchainToken(purchaseResult.usageRightId);
          if (tokenId) {
            setMintedTokenId(tokenId);
            setMintStatus('confirmed');
          } else {
            setMintStatus('timeout');
          }
        } catch {
          setMintStatus('timeout');
        }
      })();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '購入処理に失敗しました';
      setPurchaseError(approveError ?? msg);
    } finally {
      setPurchasing(false);
    }
  };

  return {
    venue: currentVenue ?? null,
    plans,
    loading: plansLoading,
    error: !!plansError,
    refresh: () => venueId && VenueService.loadVenueDetail(venueId),
    selectedPlan,
    setSelectedPlan,
    purchasing,
    approving,
    purchaseError,
    needsApproval,
    purchaseSuccess,
    clearPurchaseSuccess,
    mintStatus,
    mintedTokenId,
    handlePurchase,
    // JPYC残高チェック関連
    balance,
    insufficientBalance,
    requiredAmount,
  };
}
