/**
 * UsageRightService: purchase / list / detail / transfer / cancel の結果を pass.store に反映する（SPEC §7）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';
import { usePassStore } from '../stores/pass.store';
import type {
  PurchasePassInput,
  PurchasePassResult,
  UsageRight,
  UsageRightDetail,
  UsageRightStatus,
} from '../models/pass.model';

function toUsageRightStatus(s: string): UsageRightStatus {
  switch (s) {
    case 'ACTIVE':
    case 'MINTED':
      return 'ACTIVE';
    case 'IN_USE':
    case 'CHECKED_IN':
    case 'LOCKED':
      return 'IN_USE';
    case 'CONSUMED':
      return 'CONSUMED';
    case 'TRANSFERRED':
      return 'TRANSFERRED';
    case 'PENDING':
      return 'PENDING';
    case 'LISTED':
      return 'LISTED';
    case 'EXPIRED':
    case 'CANCELLED':
    default:
      return 'EXPIRED';
  }
}

class UsageRightServiceClass {
  private _client: NodeStayClient | null = null;

  private get client(): NodeStayClient {
    if (!this._client) this._client = createNodeStayClient();
    return this._client;
  }

  async purchase(
    input: PurchasePassInput,
    idempotencyKey: string,
    client?: NodeStayClient,
  ): Promise<PurchasePassResult> {
    const c = client ?? this.client;
    const set = usePassStore.getState();
    set.setLoading(true);
    set.setError(null);
    try {
      const data = await c.purchaseUsageRight(
        { productId: input.productId, ownerUserId: input.ownerUserId, buyerWallet: input.buyerWallet },
        idempotencyKey,
      );
      const result: PurchasePassResult = { usageRightId: data.usageRightId };
      set.setLastPurchase(result);
      set.setLoading(false);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed';
      set.setError(msg);
      set.setLoading(false);
      throw e;
    }
  }

  async loadList(ownerUserId: string | null): Promise<void> {
    const store = usePassStore.getState();
    store.setUsageRightsLoading(true);
    store.setUsageRightsError(null);
    try {
      if (!ownerUserId) {
        store.setUsageRights([]);
        return;
      }
      const apiRights = await this.client.listUsageRights({ ownerUserId });
      const now = Date.now();
      const usageRights: UsageRight[] = apiRights.map((r) => {
        const product = r.usageProduct as {
          name?: string;
          productName?: string;
          durationMinutes?: number;
          priceMinor?: number;
          priceJpyc?: string;
          venue?: { id?: string; name?: string };
          venueId?: string;
        };
        const apiRow = r as { remainingMinutes?: number; endAt?: string };
        const totalDurationMinutes = product.durationMinutes ?? 0;
        const remainingMinutes =
          typeof apiRow.remainingMinutes === 'number'
            ? apiRow.remainingMinutes
            : apiRow.endAt
              ? Math.max(0, Math.floor((new Date(apiRow.endAt).getTime() - now) / 60000))
              : totalDurationMinutes;
        const expiresAt =
          apiRow.endAt && !Number.isNaN(new Date(apiRow.endAt).getTime())
            ? new Date(apiRow.endAt).toISOString()
            : '';

        const row = r as { listingId?: string; onchainListingId?: string | null };
        return {
          usageRightId: r.id,
          onchainTokenId: r.onchainTokenId ?? undefined,
          planName: product.name ?? product.productName ?? '利用権',
          venueName: product.venue?.name ?? '店舗',
          venueId: product.venueId ?? product.venue?.id ?? '',
          status: toUsageRightStatus(r.status),
          remainingMinutes,
          totalDurationMinutes: totalDurationMinutes || Math.max(remainingMinutes, 1),
          expiresAt,
          depositAmountMinor:
            product.priceMinor ?? Number(product.priceJpyc ?? '0') * 100,
          depositStatus: 'NONE' as const,
          transferable: (r as { transferable?: boolean }).transferable ?? false,
          listingId: row.listingId ?? undefined,
          onchainListingId: row.onchainListingId ?? undefined,
        };
      });
      store.setUsageRights(usageRights);
    } catch (e) {
      store.setUsageRightsError(e instanceof Error ? e.message : 'Failed to load usage rights');
      store.setUsageRights([]);
    } finally {
      store.setUsageRightsLoading(false);
    }
  }

  async loadDetail(id: string | undefined): Promise<void> {
    const store = usePassStore.getState();
    store.setUsageRightDetailLoading(true);
    store.setUsageRightDetailNotFound(false);
    store.setUsageRightDetail(null);
    if (!id) {
      store.setUsageRightDetailLoading(false);
      return;
    }
    try {
      const data = await this.client.getUsageRight(id);
      const usageProduct = data.usageProduct as {
        name?: string;
        productName?: string;
        id?: string;
        venueId?: string;
        durationMinutes?: number;
        depositRequiredMinor?: number;
        priceMinor?: number;
        priceJpyc?: string;
        venue?: { id?: string; name?: string; address?: string };
      };
      const apiRow = data as { startAt?: string | null; endAt?: string | null; remainingMinutes?: number };
      const startAt = apiRow.startAt && !Number.isNaN(new Date(apiRow.startAt).getTime()) ? apiRow.startAt : '';
      const endAt = apiRow.endAt && !Number.isNaN(new Date(apiRow.endAt).getTime()) ? apiRow.endAt : '';
      const remainingMinutes =
        typeof apiRow.remainingMinutes === 'number'
          ? apiRow.remainingMinutes
          : usageProduct.durationMinutes ?? 0;
      const detail: UsageRightDetail = {
        usageRightId: data.id,
        onchainTokenId: data.onchainTokenId,
        planName: usageProduct.name ?? usageProduct.productName ?? '利用権',
        planDurationMinutes: usageProduct.durationMinutes ?? 0,
        venueName: usageProduct.venue?.name ?? '店舗',
        venueId: usageProduct.venueId ?? usageProduct.venue?.id ?? usageProduct.id ?? '',
        venueAddress: usageProduct.venue?.address ?? '',
        status: toUsageRightStatus(data.status),
        remainingMinutes,
        purchasedAt: startAt,
        expiresAt: endAt,
        transferCutoff: data.transferCutoff,
        transferable: data.transferable,
        transferCount: data.transferCount,
        maxTransferCount: (data as { maxTransferCount?: number }).maxTransferCount ?? 0,
        depositAmountMinor: usageProduct.depositRequiredMinor ?? 0,
        depositStatus: 'NONE',
        basePriceMinor:
          usageProduct.priceMinor ??
          Number(usageProduct.priceJpyc ?? '0') * 100,
        txHash: data.onchainTxHash,
      };
      store.setUsageRightDetail(detail);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('404')) {
        store.setUsageRightDetailNotFound(true);
      }
      store.setUsageRightDetail(null);
    } finally {
      store.setUsageRightDetailLoading(false);
    }
  }

  async transfer(
    id: string,
    newOwnerUserId: string,
    onchainTxHash: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.client.transferUsageRight(id, newOwnerUserId, onchainTxHash, idempotencyKey);
  }

  async cancel(id: string): Promise<void> {
    await this.client.cancelUsageRight(id);
  }

  async waitForOnchainToken(
    usageRightId: string,
    opts?: { maxAttempts?: number; intervalMs?: number },
  ): Promise<string | null> {
    const maxAttempts = opts?.maxAttempts ?? 8;
    const intervalMs = opts?.intervalMs ?? 1500;

    for (let i = 0; i < maxAttempts; i += 1) {
      const data = await this.client.getUsageRight(usageRightId);
      if (data.onchainTokenId != null && String(data.onchainTokenId).trim() !== '') {
        return String(data.onchainTokenId);
      }
      if (i < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    return null;
  }
}

export const UsageRightService = new UsageRightServiceClass();
