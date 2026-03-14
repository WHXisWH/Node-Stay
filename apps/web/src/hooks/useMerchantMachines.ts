/**
 * useMerchantMachines: 加盟店マシン管理ロジック（SPEC §8）。
 * マシン一覧・ステータス変更・フィルタ状態を保持し、表示層へ渡す。
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import { NodeStayApiError } from '@nodestay/api-client';

export type MachineStatus = 'REGISTERED' | 'ACTIVE' | 'PAUSED' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type MachineClass = 'GPU' | 'CPU' | 'PREMIUM' | 'STANDARD';

export interface MachineListItem {
  id: string;
  machineId: string;
  venueId: string;
  venueName: string;
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

export interface MerchantVenueOption {
  venueId: string;
  name: string;
}

export type MachineFilterStatus = 'all' | 'onchain' | MachineStatus;

export interface UseMerchantMachinesReturn {
  venues: MerchantVenueOption[];
  selectedVenueId: string;
  setSelectedVenueId: (id: string) => void;
  machines: MachineListItem[];
  filtered: MachineListItem[];
  filterStatus: MachineFilterStatus;
  setFilterStatus: (s: MachineFilterStatus) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  updatingId: string | null;
  removingId: string | null;
  removeError: string | null;
  handleStatusChange: (id: string, status: MachineStatus) => void;
  handleRemove: (id: string) => void;
  loading: boolean;
}

function parseApiError(error: unknown, fallback: string): string {
  if (error instanceof NodeStayApiError) {
    if (error.bodyJson && typeof error.bodyJson === 'object') {
      const msg = (error.bodyJson as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useMerchantMachines(): UseMerchantMachinesReturn {
  const [venues, setVenues] = useState<MerchantVenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all');
  const [machines, setMachines] = useState<MachineListItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<MachineFilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    setRemoveError(null);
    try {
      const client = createNodeStayClient();
      const myVenues = await client.listMyMerchantVenues();
      const nextVenues: MerchantVenueOption[] = myVenues.map((venue) => ({
        venueId: venue.venueId,
        name: venue.name,
      }));
      setVenues(nextVenues);

      if (nextVenues.length === 0) {
        setMachines([]);
        return;
      }

      const targetVenueIds =
        selectedVenueId !== 'all' && nextVenues.some((v) => v.venueId === selectedVenueId)
          ? [selectedVenueId]
          : nextVenues.map((v) => v.venueId);

      if (selectedVenueId !== 'all' && targetVenueIds.length !== 1) {
        setSelectedVenueId('all');
      }

      const venueNameMap = new Map(nextVenues.map((v) => [v.venueId, v.name]));
      const machineBatches = await Promise.all(
        targetVenueIds.map(async (venueId) => ({
          venueId,
          rows: await client.listMachines({ venueId }),
        })),
      );
      const nextMachines = machineBatches.flatMap(({ venueId, rows }) =>
        rows.map((m) => ({
          id: m.id,
          machineId: m.machineId,
          venueId,
          venueName: venueNameMap.get(venueId) ?? '不明店舗',
          machineClass: m.machineClass as MachineClass,
          localSerial: m.localSerial ?? null,
          label:
            m.localSerial && m.localSerial.trim().length > 0
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
      setMachines(nextMachines);
    } catch {
      // エラー時は空配列を維持（例外を上位に伝播させない）
      setMachines([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    void loadMachines();
  }, [loadMachines]);

  const filtered = useMemo(() => {
    return machines.filter((m) => {
      const matchStatus =
        filterStatus === 'all'
        || (filterStatus === 'onchain' ? !!m.onchainTokenId : m.status === filterStatus);
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.cpu.toLowerCase().includes(q) ||
        (m.gpu?.toLowerCase().includes(q) ?? false) ||
        m.venueName.toLowerCase().includes(q);
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

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    setRemoveError(null);
    try {
      const client = createNodeStayClient();
      await client.deleteMachine(id);
      await loadMachines();
    } catch (error) {
      setRemoveError(parseApiError(error, 'マシンの削除に失敗しました。'));
    } finally {
      setRemovingId(null);
    }
  };

  return {
    venues,
    selectedVenueId,
    setSelectedVenueId,
    machines,
    filtered,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    updatingId,
    removingId,
    removeError,
    handleStatusChange,
    handleRemove,
    loading,
  };
}
