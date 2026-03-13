/**
 * MarketplaceService: マーケットプレイス API の呼び出しを一元化する。
 * create/cancel/buy はオンチェーン txHash を必須にする。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';
import { useMarketplaceStore } from '../stores/marketplace.store';
import type { MarketplaceListing } from '../models/marketplace.model';

type ListingStatus = MarketplaceListing['status'];

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

class MarketplaceServiceClass {
  private _client: NodeStayClient | null = null;

  private get client(): NodeStayClient {
    if (!this._client) this._client = createNodeStayClient();
    return this._client;
  }

  async createListing(params: {
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    expiryAt?: string;
    onchainTxHash: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.client.createMarketplaceListing(
      {
        usageRightId: params.usageRightId,
        sellerUserId: params.sellerUserId,
        priceJpyc: params.priceJpyc,
        expiryAt: params.expiryAt,
        onchainTxHash: params.onchainTxHash,
      },
      params.idempotencyKey,
    );
  }

  async cancelListing(
    listingId: string,
    userId: string,
    onchainTxHash: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.client.cancelMarketplaceListing(
      listingId,
      userId,
      onchainTxHash,
      idempotencyKey ?? makeIdempotencyKey(`cancel-${listingId}`),
    );
  }

  async buyListing(
    listingId: string,
    buyerUserId: string,
    onchainTxHash: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.client.buyMarketplaceListing(
      listingId,
      buyerUserId,
      onchainTxHash,
      idempotencyKey ?? makeIdempotencyKey(`buy-${listingId}`),
    );
  }

  async loadListings(): Promise<void> {
    const store = useMarketplaceStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const data = await this.client.listMarketplaceListings();
      const listings: MarketplaceListing[] = data.map((item) => ({
        listingId: item.id,
        listingType: 'USAGE' as const,
        planName: item.usageRight?.usageProduct?.productName ?? '利用権',
        venueName: item.venueName ?? '店舗',
        venueAddress: '',
        durationMinutes: item.usageRight?.usageProduct?.durationMinutes ?? 0,
        remainingMinutes: item.usageRight?.usageProduct?.durationMinutes ?? 0,
        expiresAt: item.expiryAt ?? item.createdAt,
        transferable: true,
        sellerAddress: item.sellerUserId,
        priceMinor: Math.round(parseFloat(item.priceJpyc) * 100),
        originalPriceMinor: Math.round(parseFloat(item.priceJpyc) * 100),
        status: item.status as ListingStatus,
        listedAt: item.createdAt,
        onchainTokenId: item.onchainListingId,
      }));
      store.setListings(listings);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : '出品一覧の取得に失敗しました');
      store.setListings([]);
    } finally {
      store.setLoading(false);
    }
  }
}

export const MarketplaceService = new MarketplaceServiceClass();
