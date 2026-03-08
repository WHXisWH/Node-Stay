'use client';

/**
 * useSessionPage: セッション Controller（SPEC §8）。
 * activeSessionId を User store から取得し、API でセッション実データを取得する。
 * セッション状態と checkout API を保持；View は props で表示のみ。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import { useUserStore } from '../stores/user.store';

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

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** API からセッション情報を取得し ActiveSession 型にマッピング */
  const loadSession = useCallback(async () => {
    if (!activeSessionId) {
      setSession(null);
      return;
    }
    setLoading(true);
    try {
      const client = createNodeStayClient();
      const data = await client.getSession(activeSessionId);
      // API レスポンスを ActiveSession 型にマッピング
      const status: SessionStatus =
        data.status === 'IN_USE'
          ? 'IN_USE'
          : data.status === 'COMPLETED'
          ? 'ENDED'
          : 'IN_USE';
      setSession({
        sessionId: data.sessionId,
        usageRightId: data.usageRightId,
        planName: data.planName,
        venueName: data.venueName,
        // machineId が null の場合は '-' にフォールバック
        seatId: data.machineId ?? '-',
        // API に seatType フィールドがないため固定値を使用
        seatType: 'BOOTH',
        checkInAt: data.checkedInAt,
        // usageProduct から取得するが API レスポンスに含まれないため簡略化
        baseDurationMinutes: 180,
        basePriceMinor: 0,
        status,
      });
    } catch {
      // エラー時はセッションを null にリセット
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

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
    setChecking(true);
    try {
      const client = createNodeStayClient();
      const key = `checkout-${session.sessionId}-${Date.now()}`;
      const result = await client.checkoutSession({ sessionId: session.sessionId }, key);
      const r = result as { usedMinutes?: number; charges?: { baseMinor?: number }; chargesMinor?: number };
      // タイマーを停止してチェックアウト結果を保存
      if (intervalRef.current) clearInterval(intervalRef.current);
      setCheckoutResult({
        usedMinutes: r.usedMinutes ?? Math.floor(elapsed / 60),
        chargesMinor: r.charges?.baseMinor ?? r.chargesMinor ?? session.basePriceMinor,
      });
      // User store からアクティブセッション ID を削除
      setActiveSessionId(null);
      setSession(null);
    } catch {
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
