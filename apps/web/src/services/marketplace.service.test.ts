/**
 * MarketplaceService: loadListings success writes store, failure writes error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceService } from './marketplace.service';

const mockSetLoading = vi.fn();
const mockSetError = vi.fn();
const mockSetListings = vi.fn();

vi.mock('../stores/marketplace.store', () => ({
  useMarketplaceStore: {
    getState: () => ({
      setLoading: mockSetLoading,
      setError: mockSetError,
      setListings: mockSetListings,
    }),
  },
}));

const mockListMarketplaceListings = vi.fn();
vi.mock('./nodestay', () => ({
  createNodeStayClient: () => ({
    listMarketplaceListings: (...args: unknown[]) => mockListMarketplaceListings(...args),
  }),
}));

describe('MarketplaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadListings sets loading true then fetches and writes listings to store', async () => {
    mockListMarketplaceListings.mockResolvedValue([
      {
        id: 'list-1',
        usageRight: {
          usageProduct: { productName: '1h 利用権', durationMinutes: 60 },
          usageProductId: 'p1',
        },
        sellerUserId: 'u1',
        priceJpyc: '100.5',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        expiryAt: '2026-02-01T00:00:00Z',
        onchainListingId: '1',
      },
    ]);

    await MarketplaceService.loadListings();

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockSetListings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          listingId: 'list-1',
          planName: '1h 利用権',
          durationMinutes: 60,
          priceMinor: 10050,
          status: 'ACTIVE',
          sellerAddress: 'u1',
        }),
      ])
    );
    expect(mockSetLoading).toHaveBeenLastCalledWith(false);
  });

  it('loadListings on API error sets error and empty listings', async () => {
    mockListMarketplaceListings.mockRejectedValue(new Error('Network error'));

    await MarketplaceService.loadListings();

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetError).toHaveBeenCalledWith('Network error');
    expect(mockSetListings).toHaveBeenCalledWith([]);
    expect(mockSetLoading).toHaveBeenLastCalledWith(false);
  });

  it('loadListings on non-Error rejection uses default error message', async () => {
    mockListMarketplaceListings.mockRejectedValue('string error');

    await MarketplaceService.loadListings();

    expect(mockSetError).toHaveBeenCalledWith('出品一覧の取得に失敗しました');
    expect(mockSetListings).toHaveBeenCalledWith([]);
  });
});
