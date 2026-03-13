/**
 * useMerchantCompute: 加盟店向けコンピュート設定の Controller。
 * ローカルのダミー追加は行わず、常に API 取得結果を表示する。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import type { ManagedNode } from '../models/merchant.model';

export interface UseMerchantComputeReturn {
  venueName: string;
  nodes: ManagedNode[];
  editingNode: ManagedNode | null | undefined;
  setEditingNode: (n: ManagedNode | null | undefined) => void;
  saving: boolean;
  saveSuccess: boolean;
  loading: boolean;
  handleToggle: (nodeId: string) => void;
  handleSave: (data: Partial<ManagedNode>) => Promise<void>;
}

function toUiStatus(status: string): ManagedNode['status'] {
  if (status === 'ACTIVE') return 'IDLE';
  return 'OFFLINE';
}

export function useMerchantCompute(): UseMerchantComputeReturn {
  const [venueName, setVenueName] = useState('');
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [editingNode, setEditingNode] = useState<ManagedNode | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentVenueId, setCurrentVenueId] = useState<string>('');

  const loadNodes = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();
      const venues = await client.listVenues();
      const venue = venues[0];
      if (!venue) {
        setVenueName('');
        setCurrentVenueId('');
        setNodes([]);
        return;
      }

      setVenueName(venue.name);
      setCurrentVenueId(venue.venueId);

      const machines = await client.listMachines({ venueId: venue.venueId });
      setNodes(
        machines.map((m) => ({
          nodeId: m.id,
          seatId: m.machineId ?? '',
          seatLabel: `${m.machineClass} - ${(m.machineId ?? '').slice(0, 8)}`,
          specs: {
            cpuModel: m.cpu ?? '',
            cpuCores: 0,
            gpuModel: m.gpu ?? '',
            vram: 0,
            ram: m.ramGb ?? 0,
          },
          status: toUiStatus(m.status),
          enabled: m.status === 'ACTIVE',
          // 価格は API に存在しないため 0 を表示し、編集値のみ反映する。
          pricePerHourMinor: 0,
          minBookingHours: 1,
          maxBookingHours: 8,
          supportedTasks: ['GENERAL'],
          availableWindows: [],
          earnings: {
            thisMonthMinor: 0,
            totalMinor: 0,
            completedJobs: 0,
            uptimePercent: 0,
          },
        })),
      );
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const handleToggle = (nodeId: string) => {
    const node = nodes.find((n) => n.nodeId === nodeId);
    if (!node) return;
    void handleSave({ enabled: !node.enabled });
  };

  const handleSave = async (data: Partial<ManagedNode>) => {
    setSaving(true);
    try {
      let venueId = currentVenueId;
      if (!venueId) {
        const client = createNodeStayClient();
        const venues = await client.listVenues();
        venueId = venues[0]?.venueId ?? '';
        if (venueId) setCurrentVenueId(venueId);
      }

      if (!venueId) {
        throw new Error('会場情報が見つかりません');
      }

      const targetEnabled = editingNode
        ? (data.enabled ?? editingNode.enabled)
        : (data.enabled ?? false);

      const client = createNodeStayClient();
      await client.enableCompute(venueId, targetEnabled);

      await loadNodes();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch {
      // エラー文言は画面側で表示する。
    } finally {
      setSaving(false);
      setEditingNode(undefined);
    }
  };

  return {
    venueName,
    nodes,
    editingNode,
    setEditingNode,
    saving,
    saveSuccess,
    loading,
    handleToggle,
    handleSave,
  };
}
