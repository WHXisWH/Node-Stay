/**
 * UsageRightService: loadList, loadDetail (including 404), transfer, cancel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageRightService } from './usageRight.service';

const mockSetUsageRightsLoading = vi.fn();
const mockSetUsageRightsError = vi.fn();
const mockSetUsageRights = vi.fn();
const mockSetUsageRightDetailLoading = vi.fn();
const mockSetUsageRightDetailNotFound = vi.fn();
const mockSetUsageRightDetail = vi.fn();

vi.mock('../stores/pass.store', () => ({
  usePassStore: {
    getState: () => ({
      setUsageRightsLoading: mockSetUsageRightsLoading,
      setUsageRightsError: mockSetUsageRightsError,
      setUsageRights: mockSetUsageRights,
      setUsageRightDetailLoading: mockSetUsageRightDetailLoading,
      setUsageRightDetailNotFound: mockSetUsageRightDetailNotFound,
      setUsageRightDetail: mockSetUsageRightDetail,
    }),
  },
}));

const mockListUsageRights = vi.fn();
const mockGetUsageRight = vi.fn();
const mockTransferUsageRight = vi.fn();
const mockCancelUsageRight = vi.fn();

vi.mock('./nodestay', () => ({
  createNodeStayClient: () => ({
    listUsageRights: (...args: unknown[]) => mockListUsageRights(...args),
    getUsageRight: (...args: unknown[]) => mockGetUsageRight(...args),
    transferUsageRight: (...args: unknown[]) => mockTransferUsageRight(...args),
    cancelUsageRight: (...args: unknown[]) => mockCancelUsageRight(...args),
  }),
}));

describe('UsageRightService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadList', () => {
    it('when ownerUserId is null sets empty list and does not call API', async () => {
      await UsageRightService.loadList(null);
      expect(mockSetUsageRightsLoading).toHaveBeenCalledWith(true);
      expect(mockSetUsageRightsError).toHaveBeenCalledWith(null);
      expect(mockSetUsageRights).toHaveBeenCalledWith([]);
      expect(mockListUsageRights).not.toHaveBeenCalled();
      expect(mockSetUsageRightsLoading).toHaveBeenLastCalledWith(false);
    });

    it('fetches and maps usage rights to store', async () => {
      mockListUsageRights.mockResolvedValue([
        {
          id: 'ur-1',
          status: 'ACTIVE',
          usageProduct: {
            name: '1h',
            durationMinutes: 60,
            priceMinor: 10000,
            venue: { name: 'Venue A' },
          },
        },
      ]);

      await UsageRightService.loadList('user-1');

      expect(mockListUsageRights).toHaveBeenCalledWith({ ownerUserId: 'user-1' });
      expect(mockSetUsageRights).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            usageRightId: 'ur-1',
            planName: '1h',
            venueName: 'Venue A',
            status: 'ACTIVE',
            remainingMinutes: 60,
          }),
        ])
      );
      expect(mockSetUsageRightsLoading).toHaveBeenLastCalledWith(false);
    });

    it('on error sets error and empty list', async () => {
      mockListUsageRights.mockRejectedValue(new Error('API error'));
      await UsageRightService.loadList('user-1');
      expect(mockSetUsageRightsError).toHaveBeenCalledWith('API error');
      expect(mockSetUsageRights).toHaveBeenCalledWith([]);
      expect(mockSetUsageRightsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  describe('loadDetail', () => {
    it('when id is undefined only clears loading', async () => {
      await UsageRightService.loadDetail(undefined);
      expect(mockSetUsageRightDetailLoading).toHaveBeenCalledWith(true);
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledWith(false);
      expect(mockSetUsageRightDetail).toHaveBeenCalledWith(null);
      expect(mockSetUsageRightDetailLoading).toHaveBeenCalledWith(false);
      expect(mockGetUsageRight).not.toHaveBeenCalled();
    });

    it('fetches and sets detail to store', async () => {
      mockGetUsageRight.mockResolvedValue({
        id: 'ur-1',
        onchainTokenId: '1',
        status: 'ACTIVE',
        usageProduct: {
          name: '1h',
          durationMinutes: 60,
          depositRequiredMinor: 5000,
          priceMinor: 10000,
          id: 'p1',
        },
        transferCutoff: '',
        transferable: true,
        transferCount: 0,
        onchainTxHash: '0xabc',
      });

      await UsageRightService.loadDetail('ur-1');

      expect(mockGetUsageRight).toHaveBeenCalledWith('ur-1');
      expect(mockSetUsageRightDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          usageRightId: 'ur-1',
          planName: '1h',
          status: 'ACTIVE',
          planDurationMinutes: 60,
        })
      );
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledTimes(1);
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledWith(false);
      expect(mockSetUsageRightDetailLoading).toHaveBeenLastCalledWith(false);
    });

    it('on 404 sets setUsageRightDetailNotFound(true) and detail null', async () => {
      mockGetUsageRight.mockRejectedValue(new Error('404 Not Found'));
      await UsageRightService.loadDetail('ur-missing');
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledWith(true);
      expect(mockSetUsageRightDetail).toHaveBeenCalledWith(null);
      expect(mockSetUsageRightDetailLoading).toHaveBeenLastCalledWith(false);
    });

    it('on non-404 error does not set notFound (only initial false)', async () => {
      mockGetUsageRight.mockRejectedValue(new Error('500 Server Error'));
      await UsageRightService.loadDetail('ur-1');
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledTimes(1);
      expect(mockSetUsageRightDetailNotFound).toHaveBeenCalledWith(false);
      expect(mockSetUsageRightDetail).toHaveBeenCalledWith(null);
    });
  });

  describe('transfer', () => {
    it('calls client transferUsageRight with id, newOwnerUserId, onchainTxHash, idempotencyKey', async () => {
      mockTransferUsageRight.mockResolvedValue(undefined);
      await UsageRightService.transfer('ur-1', 'user-2', '0xabc', 'idem-key-1');
      expect(mockTransferUsageRight).toHaveBeenCalledWith('ur-1', 'user-2', '0xabc', 'idem-key-1');
    });
  });

  describe('cancel', () => {
    it('calls client cancelUsageRight with id', async () => {
      mockCancelUsageRight.mockResolvedValue(undefined);
      await UsageRightService.cancel('ur-1');
      expect(mockCancelUsageRight).toHaveBeenCalledWith('ur-1');
    });
  });
});
