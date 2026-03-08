/**
 * User store.
 * walletAddress / jwt は Web3Auth フローから同期される。
 * balance は UserService が書き込む（SPEC §9）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Balance } from '../user.model';

export interface UserState {
  /** 接続中のウォレットアドレス（未接続時は null） */
  walletAddress: `0x${string}` | null;
  /** SIWE 認証後に発行される JWT（未認証時は null） */
  jwt: string | null;
  /** SIWE 認証済みかどうか */
  isAuthenticated: boolean;
  balance: Balance | null;
  loading: boolean;
  error: string | null;
  /** 現在進行中のセッション ID（セッション未開始時は null） */
  activeSessionId: string | null;
}

export interface UserActions {
  setWalletAddress: (address: `0x${string}` | null) => void;
  setJwt: (jwt: string | null) => void;
  signOut: () => void;
  setBalance: (balance: Balance | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  /** アクティブセッション ID を設定する（チェックイン時に保存、チェックアウト時に null） */
  setActiveSessionId: (id: string | null) => void;
}

const initialState: UserState = {
  walletAddress:   null,
  jwt:             null,
  isAuthenticated: false,
  balance:         null,
  loading:         false,
  error:           null,
  activeSessionId: null,
};

export const useUserStore = create<UserState & UserActions>()(
  persist(
    (set) => ({
      ...initialState,
      setWalletAddress: (walletAddress) => set({ walletAddress }),
      setJwt: (jwt) => set({ jwt, isAuthenticated: jwt !== null }),
      signOut: () => set({ jwt: null, isAuthenticated: false, walletAddress: null, balance: null, activeSessionId: null }),
      setBalance: (balance) => set({ balance, error: null }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error, loading: false }),
      clearError: () => set({ error: null }),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
    }),
    {
      name:    'nodestay-user',
      // jwt / walletAddress / activeSessionId を LocalStorage に永続化（残高は毎回再取得）
      partialize: (s) => ({ jwt: s.jwt, isAuthenticated: s.isAuthenticated, walletAddress: s.walletAddress, activeSessionId: s.activeSessionId }),
    },
  ),
);
