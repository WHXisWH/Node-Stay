/**
 * useMerchantDashboard: 加盟店ダッシュボード Controller（SPEC §8）。
 * 収益サマリー・マシン稼働率・セッション統計を保持；View は表示のみ。
 * 集計系 API は未実装のため、売上・セッション数は 0 固定。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createNodeStayClient } from '../services/nodestay';

export interface RevenueSnapshot {
  thisMonthMinor: number;
  lastMonthMinor: number;
  totalMinor: number;
  growthPercent: number;
}

export interface MachineUtilization {
  machineId: string;
  label: string;
  machineClass: string;
  status: 'ACTIVE' | 'PAUSED' | 'MAINTENANCE' | 'REGISTERED';
  uptimePercent: number;
  sessionsThisMonth: number;
  earningsThisMonthMinor: number;
}

export interface SessionSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  avgDurationMinutes: number;
}

export interface UseMerchantDashboardReturn {
  venueId: string;
  venueName: string;
  revenue: RevenueSnapshot;
  machines: MachineUtilization[];
  sessions: SessionSummary;
  loading: boolean;
  selectedPeriod: 'week' | 'month' | 'total';
  setSelectedPeriod: (p: 'week' | 'month' | 'total') => void;
}

/** 集計 API 未実装のため、収益スナップショットはすべて 0 */
const ZERO_REVENUE: RevenueSnapshot = {
  thisMonthMinor: 0,
  lastMonthMinor: 0,
  totalMinor: 0,
  growthPercent: 0,
};

/** 集計 API 未実装のため、セッションサマリーはすべて 0 */
const ZERO_SESSIONS: SessionSummary = {
  today: 0,
  thisWeek: 0,
  thisMonth: 0,
  avgDurationMinutes: 0,
};

export function useMerchantDashboard(): UseMerchantDashboardReturn {
  const [venueId, setVenueId] = useState('');
  const [venueName, setVenueName] = useState('');
  const [machines, setMachines] = useState<MachineUtilization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'total'>('month');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();
      // 加盟店向け画面では公開店舗へフォールバックしない。
      // フォールバックすると他店舗（例: Seed データの渋谷店）を誤選択する。
      const merchantVenues = await client.listMyMerchantVenues();
      const venue = merchantVenues[0];
      if (!venue) {
        setVenueId('');
        setVenueName('');
        setMachines([]);
        return;
      }

      setVenueId(venue.venueId);
      setVenueName(venue.name);

      // マシン一覧を実データで取得
      const rawMachines = await client.listMachines({ venueId: venue.venueId });
      setMachines(
        rawMachines.map((m) => ({
          machineId: m.id,
          label: `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
          machineClass: m.machineClass,
          status: m.status as MachineUtilization['status'],
          // 集計 API 未実装のため 0 固定
          uptimePercent: 0,
          sessionsThisMonth: 0,
          earningsThisMonthMinor: 0,
        })),
      );
    } catch {
      // エラー時に前回値を残さない。誤店舗表示の抑止を優先する。
      setVenueId('');
      setVenueName('');
      setMachines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return {
    venueId,
    venueName,
    revenue: ZERO_REVENUE,
    machines,
    sessions: ZERO_SESSIONS,
    loading,
    selectedPeriod,
    setSelectedPeriod,
  };
}
