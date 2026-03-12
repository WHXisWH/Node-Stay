/**
 * useVenueDetailPage: 店舗詳細 Controller（SPEC §8）。
 * venue.store は読み取り専用で扱い、VenueService / UsageRightService を呼び出す。
 * 購入フローは useTxMode に統一し、ソーシャル（AA）/ ウォレットの分岐をこのファイル内に持たない。
 * View は本 Hook の戻り値のみで描画する。
 */

import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { useUserStore } from '../models/stores/user.store';
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
  mintStatus: 'idle' | 'pending' | 'confirmed' | 'timeout';
  mintedTokenId: string | null;
  handlePurchase: () => Promise<void>;
}

export function useVenueDetailPage(venueId: string | undefined): UseVenueDetailPageReturn {
  const {
    currentVenue,
    plans,
    plansLoading,
    plansError,
  } = useVenueStore();

  // SIWE 認証済みアドレス（API 呼び出しに使用）
  const walletAddress = useUserStore((s) => s.walletAddress);

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
  const needsApproval = isAddress(settlementAddress) && !!walletAddress;

  useEffect(() => {
    if (venueId) VenueService.loadVenueDetail(venueId);
  }, [venueId]);

  const handlePurchase = async () => {
    if (!selectedPlan || !venueId) return;
    setPurchaseError(null);
    setPurchaseSuccess(false);
    setMintStatus('idle');
    setMintedTokenId(null);
    setPurchasing(true);
    try {
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
          buyerWallet:  walletAddress ?? undefined,
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
    } catch (e) {
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
    mintStatus,
    mintedTokenId,
    handlePurchase,
  };
}
