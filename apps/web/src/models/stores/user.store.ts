/**
 * ユーザーストア。
 * アドレスは役割ごとに3フィールドで管理する。
 *   connectedWalletAddress — wagmi で注入された外部ウォレットアドレス
 *   socialWalletAddress    — Web3Auth / SNS ログイン由来のスマートウォレットアドレス
 *   walletAddress          — SIWE 認証済みアドレス（トランザクション送信に使用）
 * balance は UserService が書き込む（SPEC §9）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Balance } from '../user.model';

/** ログイン方法：ソーシャル（AA 対応）または通常ウォレット */
export type LoginMethod = 'social' | 'wallet' | null;

export interface UserState {
  /** wagmi 注入ウォレットの接続アドレス（未接続時は null） */
  connectedWalletAddress: `0x${string}` | null;
  /** SNS / Web3Auth 由来のスマートウォレットアドレス（未ログイン時は null） */
  socialWalletAddress: `0x${string}` | null;
  /** SIWE 認証済みアドレス（トランザクション送信に使用）。未認証時は null */
  walletAddress: `0x${string}` | null;
  /** SIWE 認証後に発行される JWT（未認証時は null） */
  jwt: string | null;
  /** SIWE 認証済みかどうか */
  isAuthenticated: boolean;
  /** ログイン方法（AA 判定に使用） */
  loginMethod: LoginMethod;
  balance: Balance | null;
  loading: boolean;
  error: string | null;
  /** 現在進行中のセッション ID（セッション未開始時は null） */
  activeSessionId: string | null;
}

export interface UserActions {
  /** wagmi 注入ウォレットアドレスを設定する */
  setConnectedWalletAddress: (address: `0x${string}` | null) => void;
  /** SNS / Web3Auth アドレスを設定する */
  setSocialWalletAddress: (address: `0x${string}` | null) => void;
  /** SIWE 認証済みアドレスを設定する（auth.service.ts からのみ呼び出す） */
  setWalletAddress: (address: `0x${string}` | null) => void;
  setJwt: (jwt: string | null) => void;
  /** ログイン方法を設定する（social = AA 対応、wallet = 通常ウォレット） */
  setLoginMethod: (method: LoginMethod) => void;
  signOut: () => void;
  setBalance: (balance: Balance | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  /** アクティブセッション ID を設定する（チェックイン時に保存、チェックアウト時に null） */
  setActiveSessionId: (id: string | null) => void;
}

const initialState: UserState = {
  connectedWalletAddress: null,
  socialWalletAddress:    null,
  walletAddress:          null,
  jwt:                    null,
  isAuthenticated:        false,
  loginMethod:            null,
  balance:                null,
  loading:                false,
  error:                  null,
  activeSessionId:        null,
};

export const useUserStore = create<UserState & UserActions>()(
  persist(
    (set) => ({
      ...initialState,
      setConnectedWalletAddress: (connectedWalletAddress) => set({ connectedWalletAddress }),
      setSocialWalletAddress:    (socialWalletAddress)    => set({ socialWalletAddress }),
      setWalletAddress:          (walletAddress)          => set({ walletAddress }),
      setJwt:        (jwt) => set({ jwt, isAuthenticated: jwt !== null }),
      setLoginMethod: (loginMethod) => set({ loginMethod }),
      signOut: () => set({
        jwt:                    null,
        isAuthenticated:        false,
        walletAddress:          null,
        connectedWalletAddress: null,
        socialWalletAddress:    null,
        loginMethod:            null,
        balance:                null,
        activeSessionId:        null,
      }),
      setBalance: (balance) => set({ balance, error: null }),
      setLoading: (loading) => set({ loading }),
      setError:   (error)   => set({ error, loading: false }),
      clearError: ()        => set({ error: null }),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
    }),
    {
      name: 'nodestay-user',
      // jwt / walletAddress / loginMethod / activeSessionId を LocalStorage に永続化
      // connectedWalletAddress / socialWalletAddress は揮発性のため永続化しない
      partialize: (s) => ({
        jwt:             s.jwt,
        isAuthenticated: s.isAuthenticated,
        walletAddress:   s.walletAddress,
        loginMethod:     s.loginMethod,
        activeSessionId: s.activeSessionId,
      }),
    },
  ),
);
