/**
 * RevenueService: claim 状態まわり最小テスト。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevenueService } from './revenue.service';

const mockSetClaimingId = vi.fn();
const mockSetClaimStatus = vi.fn();
const mockSetClaimError = vi.fn();
const mockSetClaimTxHash = vi.fn();

vi.mock('../stores/revenue.store', () => ({
  getRevenueStore: () => ({
    setClaimingId: mockSetClaimingId,
    setClaimStatus: mockSetClaimStatus,
    setClaimError: mockSetClaimError,
    setClaimTxHash: mockSetClaimTxHash,
  }),
}));

vi.mock('./nodestay', () => ({
  createNodeStayClient: () => ({
    claimRevenue: vi.fn(),
    listMyRevenueRights: vi.fn(),
    listRevenueClaims: vi.fn(),
    getRevenueProgram: vi.fn(),
    listRevenueAllocations: vi.fn(),
  }),
}));

describe('RevenueService (claim state)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('beginClaim sets store to submitting', () => {
    RevenueService.beginClaim('alloc-1');
    expect(mockSetClaimingId).toHaveBeenCalledWith('alloc-1');
    expect(mockSetClaimStatus).toHaveBeenCalledWith('alloc-1', 'submitting');
    expect(mockSetClaimError).toHaveBeenCalledWith('alloc-1', null);
  });

  it('markClaimPending sets status and txHash', () => {
    RevenueService.markClaimPending('alloc-1', '0xabc');
    expect(mockSetClaimStatus).toHaveBeenCalledWith('alloc-1', 'pending');
    expect(mockSetClaimTxHash).toHaveBeenCalledWith('alloc-1', '0xabc');
    expect(mockSetClaimError).toHaveBeenCalledWith('alloc-1', null);
  });

  it('markClaimFinalized sets status and clears error', () => {
    RevenueService.markClaimFinalized('alloc-1', '0xfinal');
    expect(mockSetClaimingId).toHaveBeenCalledWith('alloc-1');
    expect(mockSetClaimStatus).toHaveBeenCalledWith('alloc-1', 'finalized');
    expect(mockSetClaimTxHash).toHaveBeenCalledWith('alloc-1', '0xfinal');
    expect(mockSetClaimError).toHaveBeenCalledWith('alloc-1', null);
  });

  it('markClaimFailed sets status and error', () => {
    RevenueService.markClaimFailed('alloc-1', 'User rejected');
    expect(mockSetClaimingId).toHaveBeenCalledWith('alloc-1');
    expect(mockSetClaimStatus).toHaveBeenCalledWith('alloc-1', 'failed');
    expect(mockSetClaimError).toHaveBeenCalledWith('alloc-1', 'User rejected');
  });

  it('clearClaiming resets to idle', () => {
    RevenueService.clearClaiming('alloc-1');
    expect(mockSetClaimingId).toHaveBeenCalledWith(null);
    expect(mockSetClaimStatus).toHaveBeenCalledWith('alloc-1', 'idle');
    expect(mockSetClaimError).toHaveBeenCalledWith('alloc-1', null);
  });
});
