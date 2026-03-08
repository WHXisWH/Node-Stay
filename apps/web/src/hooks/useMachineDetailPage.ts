'use client';

/**
 * useMachineDetailPage: マシン詳細 Controller Hook。
 * API からマシン情報とタイムスロットを取得して提供する。
 */

import { useCallback, useEffect, useState } from 'react';
import { createNodeStayClient } from '../services/nodestay';

// ===== 型定義 =====

export interface MachineSpec {
  cpu: string | null;
  gpu: string | null;
  ramGb: number | null;
  storageGb: number | null;
}

export type MachineStatus =
  | 'REGISTERED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'MAINTENANCE'
  | 'DECOMMISSIONED';

export interface SlotWindow {
  from: string;   // ISO datetime
  to: string;     // ISO datetime
  status: 'AVAILABLE' | 'OCCUPIED' | 'BLOCKED';
  slotType: 'USAGE' | 'COMPUTE';
}

export interface MachineDetail {
  id: string;
  machineId: string;
  venueId: string;
  venueName: string;
  venueAddress: string;
  machineClass: 'GPU' | 'CPU' | 'STANDARD' | 'PREMIUM';
  label: string;
  spec: MachineSpec;
  status: MachineStatus;
  onchainTokenId: string | null;
  onchainTxHash: string | null;
  computeEnabled: boolean;
  sessionsTotal: number;
  earningsTotalMinor: number;
}

export interface UseMachineDetailPageReturn {
  machine: MachineDetail | null;
  slots: SlotWindow[];
  loading: boolean;
  notFound: boolean;
  slotsLoading: boolean;
  selectedDate: string;        // YYYY-MM-DD
  setSelectedDate: (d: string) => void;
}

// ===== ユーティリティ =====

/** 今日の日付を YYYY-MM-DD 形式で返すユーティリティ */
function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ===== Hook 本体 =====

/**
 * マシン詳細ページ用 Hook。
 * @param machineId - URLパラメータから取得したマシンID
 */
export function useMachineDetailPage(machineId: string | undefined): UseMachineDetailPageReturn {
  // 選択日付の状態（デフォルトは今日、YYYY-MM-DD 形式）
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString);

  // マシン情報の状態
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // スロット情報の状態
  const [slots, setSlots] = useState<SlotWindow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  /** API からマシン詳細を取得し MachineDetail 型にマッピング */
  const loadMachine = useCallback(async () => {
    if (!machineId) {
      setLoading(false);
      setNotFound(false);
      setMachine(null);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const client = createNodeStayClient();
      const data = await client.getMachine(machineId);
      // machineClass を列挙型に正規化（不明な場合は STANDARD にフォールバック）
      const validClasses = ['GPU', 'CPU', 'STANDARD', 'PREMIUM'] as const;
      const machineClass = validClasses.includes(data.machineClass as typeof validClasses[number])
        ? (data.machineClass as MachineDetail['machineClass'])
        : 'STANDARD';
      // status を列挙型に正規化
      const validStatuses = ['REGISTERED', 'ACTIVE', 'PAUSED', 'MAINTENANCE', 'DECOMMISSIONED'] as const;
      const status = validStatuses.includes(data.status as typeof validStatuses[number])
        ? (data.status as MachineStatus)
        : 'REGISTERED';
      setMachine({
        id: data.id,
        machineId: data.machineId,
        venueId: data.venueId,
        venueName: data.venue?.name ?? '',
        // API に venueAddress フィールドがないためデフォルト値を使用
        venueAddress: '',
        machineClass,
        // ラベルはクラスと machineId の先頭8文字から生成
        label: `${machineClass} - ${data.machineId?.slice(0, 8) ?? ''}`,
        spec: {
          cpu: data.cpu ?? null,
          gpu: data.gpu ?? null,
          ramGb: data.ramGb ?? null,
          storageGb: data.storageGb ?? null,
        },
        status,
        onchainTokenId: data.onchainTokenId ?? null,
        onchainTxHash: data.onchainTxHash ?? null,
        // API に computeEnabled / sessionsTotal / earningsTotalMinor がないためデフォルト値
        computeEnabled: false,
        sessionsTotal: 0,
        earningsTotalMinor: 0,
      });
    } catch {
      // 404 または その他エラーの場合は notFound を立てる
      setMachine(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  /** API から指定日付のスロット一覧を取得し SlotWindow 型にマッピング */
  const loadSlots = useCallback(async () => {
    if (!machineId) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const client = createNodeStayClient();
      // 選択日付の開始・終了 ISO 文字列を生成
      const dayStart = new Date(`${selectedDate}T00:00:00`);
      const dayEnd = new Date(`${selectedDate}T23:59:59.999`);

      const data = await client.getMachineSlots(machineId, {
        from: dayStart.toISOString(),
        to: dayEnd.toISOString(),
      });

      // API レスポンスを SlotWindow 型にマッピング
      setSlots(data.map((s) => ({
        from: s.slotStart,
        to: s.slotEnd,
        status:
          s.occupancyStatus === 'OCCUPIED' ? 'OCCUPIED'
          : s.occupancyStatus === 'AVAILABLE' ? 'AVAILABLE'
          : 'BLOCKED',
        slotType: s.slotType === 'COMPUTE' ? 'COMPUTE' : 'USAGE',
      })));
    } catch {
      // エラー時は空スロットにフォールバック
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [machineId, selectedDate]);

  // machineId が変わるたびにマシン情報を再取得
  useEffect(() => {
    void loadMachine();
  }, [loadMachine]);

  // machineId または selectedDate が変わるたびにスロットを再取得
  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  return {
    machine,
    slots,
    loading,
    notFound,
    slotsLoading,
    selectedDate,
    setSelectedDate,
  };
}
