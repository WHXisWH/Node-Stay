/**
 * Session store.
 * セッション一覧と状態は SessionService が反映する。
 * Controller は読み取り専用で扱い、checkin/checkout を呼び出す（SPEC §9、TODO M14）。
 */

import { create } from 'zustand';
import type { CheckInResult, CheckOutResult } from '../session.model';

export interface SessionListItem {
  sessionId: string;
  usageRightId: string;
  venueId: string;
  status?: string;
  checkInAt?: string;
  checkOutAt?: string;
}

export interface SessionState {
  sessions: SessionListItem[];
  activeSession: SessionListItem | null;
  lastCheckIn: CheckInResult | null;
  lastCheckOut: CheckOutResult | null;
  loading: boolean;
  checkinLoading: boolean;
  checkoutLoading: boolean;
  error: string | null;
}

export interface SessionActions {
  setSessions: (sessions: SessionListItem[]) => void;
  setActiveSession: (session: SessionListItem | null) => void;
  setLastCheckIn: (result: CheckInResult | null) => void;
  setLastCheckOut: (result: CheckOutResult | null) => void;
  setLoading: (loading: boolean) => void;
  setCheckinLoading: (loading: boolean) => void;
  setCheckoutLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const initialState: SessionState = {
  sessions: [],
  activeSession: null,
  lastCheckIn: null,
  lastCheckOut: null,
  loading: false,
  checkinLoading: false,
  checkoutLoading: false,
  error: null,
};

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  ...initialState,
  setSessions: (sessions) => set({ sessions, error: null }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setLastCheckIn: (lastCheckIn) => set({ lastCheckIn }),
  setLastCheckOut: (lastCheckOut) => set({ lastCheckOut }),
  setLoading: (loading) => set({ loading }),
  setCheckinLoading: (checkinLoading) => set({ checkinLoading }),
  setCheckoutLoading: (checkoutLoading) => set({ checkoutLoading }),
  setError: (error) => set({ error, loading: false, checkinLoading: false, checkoutLoading: false }),
  clearError: () => set({ error: null }),
}));
