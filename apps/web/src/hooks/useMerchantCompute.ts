/**
 * useMerchantCompute: 店舗向けコンピュートノード管理 Controller（SPEC §8, R8）。
 * ノード一覧・編集モーダル・保存処理を保持；View は薄く表示のみ。
 * ノード情報はマシン API から取得；個別ノード設定 API は未実装のため
 * venueId 単位の compute enable/disable のみ API を呼び出す。
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

export function useMerchantCompute(): UseMerchantComputeReturn {
  const [venueName, setVenueName] = useState('');
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [editingNode, setEditingNode] = useState<ManagedNode | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  // venueId を保持（handleToggle / handleSave で使用）
  const [currentVenueId, setCurrentVenueId] = useState<string>('');

  const loadNodes = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();

      // 最初の店舗の venueId と venueName を取得（デモ用シングル店舗前提）
      const venues = await client.listVenues();
      const venue = venues[0];
      if (!venue) return;

      setVenueName(venue.name);
      setCurrentVenueId(venue.venueId);

      // マシン一覧を実データで取得し ManagedNode にマッピング
      const machines = await client.listMachines({ venueId: venue.venueId });
      setNodes(
        machines.map((m) => ({
          nodeId: m.id,
          seatId: m.machineId ?? '',
          seatLabel: `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
          specs: {
            cpuModel: m.cpu ?? '',
            cpuCores: 0,
            gpuModel: m.gpu ?? '',
            vram: 0,
            ram: m.ramGb ?? 0,
          },
          status: 'IDLE' as ManagedNode['status'],
          enabled: m.status === 'ACTIVE',
          pricePerHourMinor: 100000,
          minBookingHours: 1,
          maxBookingHours: 8,
          supportedTasks: ['GENERAL'] as ManagedNode['supportedTasks'],
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
      // エラー時は空配列を維持（例外を上位に伝播させない）
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const handleToggle = (nodeId: string) => {
    // ローカル state のトグル（UI 即時反映）
    setNodes((prev) =>
      prev.map((n) =>
        n.nodeId === nodeId
          ? { ...n, enabled: !n.enabled, status: !n.enabled ? 'IDLE' : 'OFFLINE' }
          : n,
      ),
    );
  };

  const handleSave = async (data: Partial<ManagedNode>) => {
    setSaving(true);
    try {
      // venueId が未取得の場合は再度取得する
      let venueId = currentVenueId;
      if (!venueId) {
        const client = createNodeStayClient();
        const venues = await client.listVenues();
        venueId = venues[0]?.venueId ?? '';
        if (venueId) setCurrentVenueId(venueId);
      }

      // venueId 単位で compute enable/disable を API で更新する
      // （ノード個別設定 API は未実装のため venueId 単位の toggle のみ）
      if (venueId) {
        const client = createNodeStayClient();
        const targetEnabled = editingNode ? (data.enabled ?? editingNode.enabled) : (data.enabled ?? false);
        await client.enableCompute(venueId, targetEnabled);
      }

      if (editingNode) {
        // 既存ノードの編集内容をローカル state に反映
        setNodes((prev) =>
          prev.map((n) => (n.nodeId === editingNode.nodeId ? { ...n, ...data } : n)),
        );
      } else {
        // 新規ノードを追加（マシン登録 API は別途実装予定）
        const newNode: ManagedNode = {
          nodeId: `node-${Date.now()}`,
          seatId: `seat-new-${Date.now()}`,
          seatLabel: 'オープン O-XX',
          specs: { cpuModel: '—', cpuCores: 0, gpuModel: '', vram: 0, ram: 0 },
          status: 'OFFLINE',
          enabled: false,
          pricePerHourMinor: data.pricePerHourMinor ?? 0,
          minBookingHours: data.minBookingHours ?? 1,
          maxBookingHours: data.maxBookingHours ?? 8,
          supportedTasks: data.supportedTasks ?? ['GENERAL'],
          availableWindows: data.availableWindows ?? [],
          earnings: { thisMonthMinor: 0, totalMinor: 0, completedJobs: 0, uptimePercent: 0 },
          ...data,
        } as ManagedNode;
        setNodes((prev) => [...prev, newNode]);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch {
      // エラー時はサイレントに処理（例外を上位に伝播させない）
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
