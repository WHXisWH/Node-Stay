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
  saveError: string | null;
  loading: boolean;
  handleToggle: (nodeId: string) => void;
  handleSave: (data: Partial<ManagedNode>) => Promise<void>;
}

function toUiStatus(status: string): ManagedNode['status'] {
  if (status === 'ACTIVE') return 'IDLE';
  return 'OFFLINE';
}

function parseSaveError(error: unknown): string {
  const fallback = '保存に失敗しました。時間をおいて再試行してください。';
  if (!(error instanceof Error)) return fallback;

  const raw = error.message;
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { message?: string };
      if (parsed.message && parsed.message.trim()) return parsed.message;
    } catch {
      // JSON でなければそのままメッセージを使う。
    }
  }
  return raw || fallback;
}

export function useMerchantCompute(): UseMerchantComputeReturn {
  const [venueName, setVenueName] = useState('');
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [editingNode, setEditingNode] = useState<ManagedNode | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

      const nodes = await client.listComputeNodes();
      const venueNodes = nodes.filter((n) => n.venueId === venue.venueId);
      setNodes(
        venueNodes.map((n) => {
          const row = n as typeof n & {
            machineClass?: string | null;
            machineId?: string | null;
            gpu?: string | null;
            cpu?: string | null;
            ramGb?: number | null;
            maxDurationMinutes?: number | null;
          };
          const machineClass = row.machineClass ?? 'COMPUTE';
          const machineId = row.machineId ?? '';
          const maxBookingHours =
            row.maxDurationMinutes && row.maxDurationMinutes > 0
              ? Math.max(1, Math.floor(row.maxDurationMinutes / 60))
              : 8;

          return {
          nodeId: n.nodeId,
          seatId: n.seatId,
          seatLabel: `${machineClass} - ${(machineId || n.seatId).slice(0, 8)}`,
          specs: {
            cpuModel: row.cpu ?? '',
            cpuCores: 0,
            gpuModel: row.gpu ?? '',
            vram: 0,
            ram: row.ramGb ?? 0,
          },
          status: n.status,
          enabled: n.status !== 'OFFLINE',
          pricePerHourMinor: n.pricePerHourMinor,
          minBookingHours: 1,
          maxBookingHours,
          supportedTasks: ['GENERAL'],
          availableWindows: [],
          earnings: {
            thisMonthMinor: 0,
            totalMinor: 0,
            completedJobs: 0,
            uptimePercent: 0,
          },
        };
        }),
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
    setSaveError(null);
    let saved = false;
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
      saved = true;
    } catch (error) {
      setSaveError(parseSaveError(error));
    } finally {
      setSaving(false);
      if (saved) setEditingNode(undefined);
    }
  };

  return {
    venueName,
    nodes,
    editingNode,
    setEditingNode,
    saving,
    saveSuccess,
    saveError,
    loading,
    handleToggle,
    handleSave,
  };
}
