/**
 * useMerchantMachines: 加盟店マシン管理ロジック（SPEC §8）。
 * マシン一覧・ステータス変更・フィルタ状態を保持し、表示層へ渡す。
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createNodeStayClient } from '../services/nodestay';

export type MachineStatus = 'REGISTERED' | 'ACTIVE' | 'PAUSED' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type MachineClass = 'GPU' | 'CPU' | 'PREMIUM' | 'STANDARD';

export interface MachineListItem {
  id: string;
  machineId: string;
  machineClass: MachineClass;
  localSerial: string | null;
  label: string;
  cpu: string;
  gpu: string | null;
  ramGb: number;
  storageGb: number;
  status: MachineStatus;
  onchainTokenId: string | null;
  // 集計 API 未実装のため 0 固定
  sessionsTotal: number;
  earningsTotalMinor: number;
}

export type MachineFilterStatus = 'all' | MachineStatus;

export interface UseMerchantMachinesReturn {
  machines: MachineListItem[];
  filtered: MachineListItem[];
  filterStatus: MachineFilterStatus;
  setFilterStatus: (s: MachineFilterStatus) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  updatingId: string | null;
  handleStatusChange: (id: string, status: MachineStatus) => void;
  loading: boolean;
}

export function useMerchantMachines(): UseMerchantMachinesReturn {
  const [machines, setMachines] = useState<MachineListItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<MachineFilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();

      // 認証中の商家が所有する店舗を優先し、取得不可時のみ公開店舗一覧へフォールバックする
      const merchantVenues = await client.listMyMerchantVenues().catch(() => []);
      const venues = merchantVenues.length > 0 ? merchantVenues : await client.listVenues();
      const venue = venues[0];
      if (!venue) return;

      // マシン一覧を実データで取得
      const rawMachines = await client.listMachines({ venueId: venue.venueId });
      setMachines(
        rawMachines.map((m) => ({
          id: m.id,
          machineId: m.machineId,
          machineClass: m.machineClass as MachineClass,
          localSerial: m.localSerial ?? null,
          label: (m.localSerial && m.localSerial.trim().length > 0)
            ? m.localSerial
            : `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
          cpu: m.cpu ?? '',
          gpu: m.gpu,
          ramGb: m.ramGb ?? 0,
          storageGb: m.storageGb ?? 0,
          status: m.status as MachineStatus,
          onchainTokenId: m.onchainTokenId,
          // 集計 API 未実装のため 0 固定
          sessionsTotal: 0,
          earningsTotalMinor: 0,
        })),
      );
    } catch {
      // エラー時は空配列を維持（例外を上位に伝播させない）
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMachines();
  }, [loadMachines]);

  const filtered = useMemo(() => {
    return machines.filter((m) => {
      const matchStatus = filterStatus === 'all' || m.status === filterStatus;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.cpu.toLowerCase().includes(q) ||
        (m.gpu?.toLowerCase().includes(q) ?? false);
      return matchStatus && matchSearch;
    });
  }, [machines, filterStatus, searchQuery]);

  const handleStatusChange = async (id: string, status: MachineStatus) => {
    setUpdatingId(id);
    try {
      const client = createNodeStayClient();
      // API でステータスを更新
      await client.updateMachineStatus(id, status);
      // 成功後にローカル state を更新
      setMachines((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status } : m)),
      );
    } catch {
      // エラー時はローカル state を変更しない（例外を上位に伝播させない）
    } finally {
      setUpdatingId(null);
    }
  };

  return {
    machines,
    filtered,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    updatingId,
    handleStatusChange,
    loading,
  };
}
