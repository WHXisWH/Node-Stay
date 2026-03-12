/**
 * useAuth: wallet signIn success/failure, User rejected does not set authError, signOut calls AuthService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../services/auth.service', () => ({
  AuthService: {
    signIn: (params: unknown) => mockSignIn(params),
    signOut: () => mockSignOut(),
  },
}));

const mockSignMessageAsync = vi.fn();
vi.mock('wagmi', () => ({
  useChainId: () => 80002,
  useSignMessage: () => ({
    signMessageAsync: (params: { message: string }) => mockSignMessageAsync(params),
  }),
}));

describe('useAuth', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignMessageAsync.mockImplementation(({ message }: { message: string }) =>
      Promise.resolve(`sig:${message.slice(0, 8)}`)
    );
  });

  it('returns expected shape', () => {
    const { result } = renderHook(() => useAuth(null));
    expect(result.current).toMatchObject({
      signing: false,
      authError: null,
    });
    expect(typeof result.current.signIn).toBe('function');
    expect(typeof result.current.signInWithCustomSigner).toBe('function');
    expect(typeof result.current.signOut).toBe('function');
  });

  it('when walletAddress is null, signIn does nothing', async () => {
    const { result } = renderHook(() => useAuth(null));
    await act(async () => {
      await result.current.signIn();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signIn success: calls AuthService.signIn and does not set authError', async () => {
    mockSignIn.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(walletAddress));
    await act(async () => {
      await result.current.signIn();
    });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress,
        chainId: 80002,
      })
    );
    expect(result.current.authError).toBeNull();
    expect(result.current.signing).toBe(false);
  });

  it('signIn failure: sets authError when message is not User rejected', async () => {
    mockSignIn.mockRejectedValue(new Error('認証に失敗しました'));
    const { result } = renderHook(() => useAuth(walletAddress));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.authError).toBe('認証に失敗しました');
    expect(result.current.signing).toBe(false);
  });

  it('signIn User rejected: does not set authError', async () => {
    mockSignIn.mockRejectedValue(new Error('User rejected the request'));
    const { result } = renderHook(() => useAuth(walletAddress));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.authError).toBeNull();
  });

  it('signIn user rejected (lowercase): does not set authError', async () => {
    mockSignIn.mockRejectedValue(new Error('user rejected'));
    const { result } = renderHook(() => useAuth(walletAddress));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.authError).toBeNull();
  });

  it('signOut calls AuthService.signOut', () => {
    const { result } = renderHook(() => useAuth(walletAddress));
    act(() => {
      result.current.signOut();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
