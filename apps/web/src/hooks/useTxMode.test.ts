/**
 * useTxMode: loginMethod に応じて正しいモードを返すことを確認。
 * SNS ログイン時は AA モード、ウォレットログイン時は wallet モードを返す。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTxMode } from './useTxMode';

// useUserStore のモック
let mockLoginMethod: string | null = null;
vi.mock('../models/stores/user.store', () => ({
  useUserStore: (selector: (s: { loginMethod: string | null }) => unknown) =>
    selector({ loginMethod: mockLoginMethod }),
}));
vi.mock('../stores/user.store', () => ({
  useUserStore: (selector: (s: { loginMethod: string | null }) => unknown) =>
    selector({ loginMethod: mockLoginMethod }),
}));

// useAaTransaction のモック
const mockSendUserOp = vi.fn();
vi.mock('./useAaTransaction', () => ({
  useAaTransaction: () => ({
    sendUserOp: mockSendUserOp,
    status: 'idle',
    error: null,
    userOpHash: null,
    txHash: null,
  }),
}));

// useJPYCApprove のモック
const mockWagmiApprove = vi.fn();
vi.mock('./useJPYC', () => ({
  useJPYCApprove: () => ({
    approve: mockWagmiApprove,
    isApproving: false,
    isConfirming: false,
    isApproved: false,
    approveError: null,
  }),
}));

// encodeJpycApprove のモック（viem への依存を排除）
vi.mock('../services/aa/encodeMarketplaceCalls', () => ({
  encodeJpycApprove: () => '0xencoded',
}));

vi.mock('../services/config', () => ({
  CONTRACT_ADDRESSES: {
    jpycToken: '0x0000000000000000000000000000000000000001',
  },
}));

describe('useTxMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loginMethod が null のとき mode は wallet', () => {
    mockLoginMethod = null;
    const { result } = renderHook(() => useTxMode());
    expect(result.current.mode).toBe('wallet');
  });

  it('loginMethod が wallet のとき mode は wallet', () => {
    mockLoginMethod = 'wallet';
    const { result } = renderHook(() => useTxMode());
    expect(result.current.mode).toBe('wallet');
  });

  it('loginMethod が social のとき mode は aa', () => {
    mockLoginMethod = 'social';
    const { result } = renderHook(() => useTxMode());
    expect(result.current.mode).toBe('aa');
  });

  it('wallet モードの approveJPYC は wagmi の approve を呼ぶ', async () => {
    mockLoginMethod = 'wallet';
    mockWagmiApprove.mockResolvedValue(undefined);
    const spender = '0x0000000000000000000000000000000000000002' as `0x${string}`;
    const { result } = renderHook(() => useTxMode());
    await result.current.approveJPYC(spender, 1500);
    expect(mockWagmiApprove).toHaveBeenCalledWith(spender, 1500);
    expect(mockSendUserOp).not.toHaveBeenCalled();
  });

  it('AA モードの approveJPYC は sendUserOp を呼ぶ', async () => {
    mockLoginMethod = 'social';
    mockSendUserOp.mockResolvedValue({ userOpHash: '0xabc', txHash: '0xdef' });
    const spender = '0x0000000000000000000000000000000000000002' as `0x${string}`;
    const { result } = renderHook(() => useTxMode());
    await result.current.approveJPYC(spender, 1500);
    expect(mockSendUserOp).toHaveBeenCalledTimes(1);
    expect(mockWagmiApprove).not.toHaveBeenCalled();
  });

  it('AA モードで sendUserOp が null を返したとき approveJPYC はエラーを投げる', async () => {
    mockLoginMethod = 'social';
    mockSendUserOp.mockResolvedValue(null);
    const spender = '0x0000000000000000000000000000000000000002' as `0x${string}`;
    const { result } = renderHook(() => useTxMode());
    await expect(result.current.approveJPYC(spender, 1500)).rejects.toThrow('AA approve に失敗しました。');
  });
});
