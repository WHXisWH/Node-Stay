'use client';

/**
 * useSessionPage: セッション Controller（SPEC §8）。
 * activeSessionId を User store から取得し、API でセッション実データを取得する。
 * セッション状態と checkout API を保持；View は props で表示のみ。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import { NodeStayApiError } from '@nodestay/api-client';
import { createNodeStayClient } from '../services/nodestay';
import { useUserStore } from '../stores/user.store';
import { CONTRACT_ADDRESSES } from '../services/config';
import { useTxMode } from './useTxMode';
import { useUserState } from './useUserState';

export type SessionStatus = 'IN_USE' | 'OVERTIME' | 'ENDED';

export interface ActiveSession {
  sessionId: string;
  usageRightId: string;
  planName: string;
  venueName: string;
  seatId: string;
  seatType: 'OPEN' | 'BOOTH' | 'FLAT' | 'VIP';
  checkInAt: string;
  baseDurationMinutes: number;
  basePriceMinor: number;
  status: SessionStatus;
}

export interface CheckoutResult {
  usedMinutes: number;
  chargesMinor: number;
}

export interface UseSessionPageReturn {
  session: ActiveSession | null;
  elapsed: number;
  checking: boolean;
  checkoutResult: CheckoutResult | null;
  handleCheckout: () => Promise<void>;
  /** API 取得中フラグ */
  loading: boolean;
}

export function useSessionPage(): UseSessionPageReturn {
  // User store からアクティブセッション ID を取得
  const activeSessionId = useUserStore((s) => s.activeSessionId);
  const setActiveSessionId = useUserStore((s) => s.setActiveSessionId);
  const { onchainWalletAddress, loginMethod, aaWalletAddress } = useUserState();
  const { approveJPYC } = useTxMode();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settlementAddress = CONTRACT_ADDRESSES.settlement;
  const checkoutPayerWallet = loginMethod === 'social'
    ? (aaWalletAddress ?? null)
    : (onchainWalletAddress ?? null);

  const mapSessionToActive = useCallback((data: {
    sessionId: string;
    usageRightId: string;
    planName: string;
    venueName: string;
    machineId: string | null;
    checkedInAt: string;
    status: string;
  }): ActiveSession => {
    const status: SessionStatus =
      data.status === 'IN_USE'
        ? 'IN_USE'
        : data.status === 'COMPLETED'
          ? 'ENDED'
          : 'IN_USE';
    return {
      sessionId: data.sessionId,
      usageRightId: data.usageRightId,
      planName: data.planName,
      venueName: data.venueName,
      seatId: data.machineId ?? '-',
      seatType: 'BOOTH',
      checkInAt: data.checkedInAt,
      baseDurationMinutes: 180,
      basePriceMinor: 0,
      status,
    };
  }, []);

  const completeCheckout = useCallback((payload: unknown) => {
    const r = payload as { usedMinutes?: number; charges?: { baseMinor?: number }; chargesMinor?: number };
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCheckoutResult({
      usedMinutes: r.usedMinutes ?? Math.floor(elapsed / 60),
      chargesMinor: r.charges?.baseMinor ?? r.chargesMinor ?? session?.basePriceMinor ?? 0,
    });
    setActiveSessionId(null);
    setSession(null);
  }, [elapsed, session?.basePriceMinor, setActiveSessionId]);

  const maybeApproveAndRetryCheckout = useCallback(async (
    error: unknown,
    sessionId: string,
  ): Promise<boolean> => {
    if (!(error instanceof NodeStayApiError)) return false;
    if (error.status !== 422) return false;
    if (!checkoutPayerWallet || !isAddress(checkoutPayerWallet)) return false;
    if (!error.bodyJson || typeof error.bodyJson !== 'object') return false;

    const payload = error.bodyJson as Record<string, unknown>;
    if (payload.errorCode !== 'INSUFFICIENT_ALLOWANCE') return false;
    const spender =
      typeof payload.settlementAddress === 'string' && isAddress(payload.settlementAddress)
        ? payload.settlementAddress
        : settlementAddress;
    if (!isAddress(spender)) return false;

    const requiredWeiRaw = payload.requiredWei;
    if (typeof requiredWeiRaw !== 'string' || !/^[0-9]+$/.test(requiredWeiRaw)) return false;
    const requiredWei = BigInt(requiredWeiRaw);
    const WEI_PER_JPYC = 10n ** 18n;
    const approveJpyc = requiredWei / WEI_PER_JPYC + (requiredWei % WEI_PER_JPYC === 0n ? 0n : 1n);
    if (approveJpyc <= 0n || approveJpyc > BigInt(Number.MAX_SAFE_INTEGER)) return false;

    await approveJPYC(spender as `0x${string}`, Number(approveJpyc));
    const client = createNodeStayClient();
    const retryKey = `checkout-retry-${sessionId}-${Date.now()}`;
    const retryResult = await client.checkoutSession({ sessionId, payerWallet: checkoutPayerWallet }, retryKey);
    completeCheckout(retryResult);
    return true;
  }, [approveJPYC, checkoutPayerWallet, completeCheckout, settlementAddress]);

  /** API からセッション情報を取得し ActiveSession 型にマッピング */
  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();
      if (!activeSessionId) {
        const inUseSessions = await client.listSessions({ status: 'IN_USE', limit: 1 });
        const current = inUseSessions[0];
        if (!current) {
          setSession(null);
          return;
        }
        setActiveSessionId(current.sessionId);
        setSession(mapSessionToActive(current));
        return;
      }

      const data = await client.getSession(activeSessionId);
      setSession(mapSessionToActive(data));
    } catch {
      // エラー時はセッションを null にリセット
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, mapSessionToActive, setActiveSessionId]);

  // activeSessionId が変わるたびにセッション情報を再取得
  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // セッションが IN_USE の間、経過時間タイマーを動かす
  useEffect(() => {
    if (!session || session.status !== 'IN_USE') return;
    const calcElapsed = () =>
      Math.floor((Date.now() - new Date(session.checkInAt).getTime()) / 1000);
    setElapsed(calcElapsed());
    intervalRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);

  /** チェックアウト処理：API を呼び出し、成功後にアクティブセッション ID をクリア */
  const handleCheckout = async () => {
    if (!session) return;
    if (loginMethod === 'social' && !aaWalletAddress) {
      alert('AAウォレットが未初期化です。アカウントメニューから AA ウォレットを初期化してから再試行してください。');
      return;
    }
    setChecking(true);
    try {
      const client = createNodeStayClient();
      const key = `checkout-${session.sessionId}-${Date.now()}`;
      const result = await client.checkoutSession(
        { sessionId: session.sessionId, payerWallet: checkoutPayerWallet ?? undefined },
        key,
      );
      completeCheckout(result);
    } catch (e) {
      const recovered = await maybeApproveAndRetryCheckout(e, session.sessionId).catch(() => false);
      if (recovered) return;
      if (e instanceof NodeStayApiError && e.bodyJson && typeof e.bodyJson === 'object') {
        const payload = e.bodyJson as Record<string, unknown>;
        const message = typeof payload.message === 'string' ? payload.message : '';
        if (message) {
          alert(message);
          return;
        }
      }
      alert('チェックアウトに失敗しました。スタッフにお声がけください。');
    } finally {
      setChecking(false);
    }
  };

  return {
    session,
    elapsed,
    checking,
    checkoutResult,
    handleCheckout,
    loading,
  };
}
