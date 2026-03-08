/**
 * useVenueDetailPage: 店舗詳細 Controller（SPEC §8）。
 * venue.store を読み取り専用で扱い、VenueService / PassService を呼び出す。
 * View は本 Hook の戻り値のみを表示する。
 */

import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { useUserStore } from '../models/stores/user.store';
import { useVenueStore } from '../stores/venue.store';
import { VenueService } from '../services/venue.service';
import { CONTRACT_ADDRESSES } from '../services/config';
import { PassService } from '../services/pass.service';
import { useJPYCApprove } from './useJPYC';
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
  needsWalletApproval: boolean;
  purchaseSuccess: boolean;
  handlePurchase: () => Promise<void>;
}

export function useVenueDetailPage(venueId: string | undefined): UseVenueDetailPageReturn {
  const {
    currentVenue,
    plans,
    plansLoading,
    plansError,
  } = useVenueStore();
  const walletAddress = useUserStore((s) => s.walletAddress);
  const [selectedPlan, setSelectedPlan] = useState<PlanListItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const { approve } = useJPYCApprove();

  const settlementAddress = CONTRACT_ADDRESSES.settlement;
  const needsWalletApproval = isAddress(settlementAddress) && !!walletAddress;

  useEffect(() => {
    if (venueId) VenueService.loadVenueDetail(venueId);
  }, [venueId]);

  const handlePurchase = async () => {
    if (!selectedPlan || !venueId) return;
    setPurchaseError(null);
    setPurchaseSuccess(false);
    setPurchasing(true);
    try {
      if (needsWalletApproval) {
        setApproving(true);
        const totalMinor = selectedPlan.basePriceMinor + selectedPlan.depositRequiredMinor;
        const totalJPYC = totalMinor / 100;
        await approve(settlementAddress as `0x${string}`, totalJPYC);
      }

      await PassService.purchase(
        { productId: selectedPlan.productId },
        `purchase-${selectedPlan.productId}-${Date.now()}`
      );
      setPurchaseSuccess(true);
      setSelectedPlan(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '購入処理に失敗しました';
      setPurchaseError(msg);
    } finally {
      setApproving(false);
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
    needsWalletApproval,
    purchaseSuccess,
    handlePurchase,
  };
}
