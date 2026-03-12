/**
 * AuthService: signIn (nonce → SIWE → verify → setJwt), signOut, isAuthenticated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

const mockSetJwt = vi.fn();
const mockSetWalletAddress = vi.fn();
const mockSignOut = vi.fn();
const mockGetState = vi.fn(() => ({
  setWalletAddress: mockSetWalletAddress,
  setJwt: mockSetJwt,
  signOut: mockSignOut,
  isAuthenticated: false,
}));

vi.mock('../models/stores/user.store', () => ({
  useUserStore: {
    getState: () => mockGetState(),
  },
}));

vi.mock('./config', () => ({
  getApiBaseUrl: (url: string | undefined) => (url ?? 'http://localhost:3001').replace(/\/+$/, ''),
}));

describe('AuthService', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;
  const signMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      setWalletAddress: mockSetWalletAddress,
      setJwt: mockSetJwt,
      signOut: mockSignOut,
      isAuthenticated: false,
    });
    global.fetch = vi.fn();
  });

  describe('signIn', () => {
    it('fetches nonce then verify then calls setJwt with token', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ nonce: 'n123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'jwt.xxx.yyy' }),
        });
      signMessage.mockResolvedValue('0xsig');

      await AuthService.signIn({
        walletAddress,
        chainId: 80002,
        signMessage,
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/v1/auth/nonce?address=');
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toContain('/v1/auth/verify');
      expect(signMessage).toHaveBeenCalledWith(expect.stringContaining('Chain ID: 80002'));
      expect(signMessage).toHaveBeenCalledWith(expect.stringContaining('Nonce: n123'));
      expect(mockSetWalletAddress).toHaveBeenCalledWith(
        expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      );
      const savedAddress = mockSetWalletAddress.mock.calls[0]?.[0] as string;
      expect(savedAddress.toLowerCase()).toBe(walletAddress.toLowerCase());
      expect(mockSetJwt).toHaveBeenCalledWith('jwt.xxx.yyy');
    });

    it('throws when nonce request is not ok', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });

      await expect(
        AuthService.signIn({
          walletAddress,
          chainId: 80002,
          signMessage,
        })
      ).rejects.toThrow('nonce の取得に失敗しました');
      expect(mockSetJwt).not.toHaveBeenCalled();
    });

    it('throws when verify request is not ok and sets backend message', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: 'n1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'Invalid signature' }),
        });
      signMessage.mockResolvedValue('0xsig');

      await expect(
        AuthService.signIn({
          walletAddress,
          chainId: 80002,
          signMessage,
        })
      ).rejects.toThrow('Invalid signature');
      expect(mockSetJwt).not.toHaveBeenCalled();
    });

    it('throws generic auth error when verify returns non-ok and no message', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: 'n1' }) })
        .mockResolvedValueOnce({ ok: false, json: () => Promise.reject(new Error('no body')) });
      signMessage.mockResolvedValue('0xsig');

      await expect(
        AuthService.signIn({
          walletAddress,
          chainId: 80002,
          signMessage,
        })
      ).rejects.toThrow('認証に失敗しました');
      expect(mockSetJwt).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('calls user store signOut', () => {
      AuthService.signOut();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when store isAuthenticated is false', () => {
      mockGetState.mockReturnValue({
        setWalletAddress: mockSetWalletAddress,
        setJwt: mockSetJwt,
        signOut: mockSignOut,
        isAuthenticated: false,
      });
      expect(AuthService.isAuthenticated()).toBe(false);
    });

    it('returns true when store isAuthenticated is true', () => {
      mockGetState.mockReturnValue({
        setWalletAddress: mockSetWalletAddress,
        setJwt: mockSetJwt,
        signOut: mockSignOut,
        isAuthenticated: true,
      });
      expect(AuthService.isAuthenticated()).toBe(true);
    });

    it('returns false when store returns undefined (falsy)', () => {
      mockGetState.mockReturnValue({
        setWalletAddress: mockSetWalletAddress,
        setJwt: mockSetJwt,
        signOut: mockSignOut,
        isAuthenticated: undefined,
      } as unknown as { setWalletAddress: typeof mockSetWalletAddress; setJwt: typeof mockSetJwt; signOut: typeof mockSignOut; isAuthenticated: boolean });
      expect(AuthService.isAuthenticated()).toBe(false);
    });
  });
});
