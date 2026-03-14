/**
 * useMerchantCompute: 加盟店向けコンピュート設定ロジック。
 * API 実データのみを利用し、ノード設定（曜日/時間/価格/タスク）を機器単位で保存する。
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
  removeError: string | null;
  removingNodeId: string | null;
  loading: boolean;
  handleToggle: (nodeId: string) => void;
  handleSave: (data: Partial<ManagedNode>) => Promise<void>;
  handleRemove: (nodeId: string) => Promise<void>;
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
      // JSON でなければそのまま下のフォールバックへ
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
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingNodeId, setRemovingNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentVenueId, setCurrentVenueId] = useState<string>('');

  const loadNodes = useCallback(async () => {
    setLoading(true);
    setSaveError(null);
    setRemoveError(null);
    try {
      const client = createNodeStayClient();
      const merchantVenues = await client.listMyMerchantVenues().catch(() => []);
      const venues = merchantVenues.length > 0 ? merchantVenues : await client.listVenues();
      const venue = venues.find((v) => v.venueId === currentVenueId) ?? venues[0];

      if (!venue) {
        setVenueName('');
        setCurrentVenueId('');
        setNodes([]);
        return;
      }

      setVenueName(venue.name);
      setCurrentVenueId(venue.venueId);
      const apiNodes = await client.listMerchantComputeNodes(venue.venueId);
      setNodes(
        apiNodes.map((node) => ({
          nodeId: node.nodeId,
          seatId: node.seatId,
          seatLabel: node.seatLabel,
          specs: node.specs,
          status: node.status,
          enabled: node.enabled,
          configured: node.configured,
          pricePerHourMinor: node.pricePerHourMinor,
          minBookingHours: node.minBookingHours,
          maxBookingHours: node.maxBookingHours,
          supportedTasks: node.supportedTasks as ManagedNode['supportedTasks'],
          availableWindows: node.availableWindows as ManagedNode['availableWindows'],
          earnings: node.earnings,
        })),
      );
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [currentVenueId]);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const handleToggle = (nodeId: string) => {
    const node = nodes.find((item) => item.nodeId === nodeId);
    if (!node) return;
    void handleSave({
      nodeId,
      enabled: !node.enabled,
      pricePerHourMinor: node.pricePerHourMinor,
      minBookingHours: node.minBookingHours,
      maxBookingHours: node.maxBookingHours,
      supportedTasks: node.supportedTasks,
      availableWindows: node.availableWindows,
    });
  };

  const handleSave = async (data: Partial<ManagedNode>) => {
    setSaving(true);
    setSaveError(null);
    let saved = false;
    try {
      const targetNode =
        (data.nodeId ? nodes.find((node) => node.nodeId === data.nodeId) : undefined)
        ?? editingNode
        ?? null;
      if (!targetNode) {
        throw new Error('対象ノードが見つかりません');
      }

      const payload = {
        enabled: data.enabled ?? targetNode.enabled,
        pricePerHourMinor: Math.max(1, Math.round(data.pricePerHourMinor ?? targetNode.pricePerHourMinor)),
        minBookingHours: Math.max(1, Math.round(data.minBookingHours ?? targetNode.minBookingHours)),
        maxBookingHours: Math.max(1, Math.round(data.maxBookingHours ?? targetNode.maxBookingHours)),
        supportedTasks: (data.supportedTasks ?? targetNode.supportedTasks) as string[],
        availableWindows: data.availableWindows ?? targetNode.availableWindows,
      };

      const client = createNodeStayClient();
      await client.upsertMerchantComputeNode(targetNode.nodeId, payload);

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

  const handleRemove = async (nodeId: string) => {
    setRemovingNodeId(nodeId);
    setRemoveError(null);
    try {
      const client = createNodeStayClient();
      await client.removeMerchantComputeNode(nodeId);
      if (editingNode?.nodeId === nodeId) {
        setEditingNode(undefined);
      }
      await loadNodes();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (error) {
      setRemoveError(parseSaveError(error));
    } finally {
      setRemovingNodeId(null);
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
    removeError,
    removingNodeId,
    loading,
    handleToggle,
    handleSave,
    handleRemove,
  };
}
