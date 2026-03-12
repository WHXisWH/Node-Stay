/**
 * MarketplaceService: listListings / createListing の結果を marketplace.store に反映する（SPEC §7）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';
import { useMarketplaceStore } from '../stores/marketplace.store';
import type { MarketplaceListing } from '../models/marketplace.model';

type ListingStatus = MarketplaceListing['status'];

class MarketplaceServiceClass {
  private _client: NodeStayClient | null = null;

  private get client(): NodeStayClient {
    if (!this._client) this._client = createNodeStayClient();
    return this._client;
  }

  /** 出品をバックエンドに登録する（オンチェーン createListing 成功後に呼び出す）。idempotencyKey 必須。 */
  async createListing(params: {
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    expiryAt?: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.client.createMarketplaceListing(
      {
        usageRightId: params.usageRightId,
        sellerUserId: params.sellerUserId,
        priceJpyc: params.priceJpyc,
        expiryAt: params.expiryAt,
      },
      params.idempotencyKey,
    );
  }

  /** 出品キャンセルをバックエンドに通知する（オンチェーン cancelListing 成功後に呼び出す）。 */
  async cancelListing(listingId: string, userId: string): Promise<void> {
    await this.client.cancelMarketplaceListing(listingId, userId);
  }

  /** 購入をバックエンドに通知する（オンチェーン buyListing 成功後に呼び出す）。buyerUserId は walletAddress 可（BE で解決）。 */
  async buyListing(listingId: string, buyerUserId: string): Promise<void> {
    await this.client.buyMarketplaceListing(listingId, buyerUserId);
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
        venueName: '店舗',
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
