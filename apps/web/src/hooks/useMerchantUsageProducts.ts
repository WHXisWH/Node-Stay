/**
 * useMerchantUsageProducts: 加盟店利用権商品管理 Controller（SPEC §8）。
 * 商品一覧・作成・編集・ステータス切り替えを保持；View は表示のみ。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createNodeStayClient } from '../services/nodestay';

export type UsageType = 'SEAT_TIME' | 'COMPUTE_TIME' | 'COMBINED';

export interface UsageProduct {
  id: string;
  name: string;
  usageType: UsageType;
  durationMinutes: number;
  priceMinor: number;
  depositRequiredMinor: number;
  transferable: boolean;
  maxTransferCount: number;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
  // 集計 API 未実装のため 0 固定
  soldCount: number;
  venueId: string;
  machineId: string | null;
}

export interface ProductFormData {
  name: string;
  usageType: UsageType;
  durationMinutes: string;
  priceMinor: string;
  depositRequiredMinor: string;
  transferable: boolean;
  maxTransferCount: string;
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  usageType: 'SEAT_TIME',
  durationMinutes: '180',
  priceMinor: '',
  depositRequiredMinor: '',
  transferable: true,
  maxTransferCount: '1',
};

export interface UseMerchantUsageProductsReturn {
  products: UsageProduct[];
  loading: boolean;
  // フォーム（作成・編集共用）
  editingProduct: UsageProduct | null;
  formData: ProductFormData;
  setFormData: (d: ProductFormData) => void;
  showForm: boolean;
  openCreate: () => void;
  openEdit: (p: UsageProduct) => void;
  closeForm: () => void;
  saving: boolean;
  saveError: string | null;
  handleSave: () => Promise<void>;
  // ステータス変更
  togglingId: string | null;
  handleToggleStatus: (id: string) => void;
}

export function useMerchantUsageProducts(): UseMerchantUsageProductsReturn {
  const [products, setProducts] = useState<UsageProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // 現在の venueId を保持（handleSave / handleToggleStatus で使用）
  const [currentVenueId, setCurrentVenueId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<UsageProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /** 商品一覧を API から取得する */
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const client = createNodeStayClient();

      // 最初の店舗の venueId を取得（デモ用シングル店舗前提）
      const venues = await client.listVenues();
      const venue = venues[0];
      if (!venue) return;

      setCurrentVenueId(venue.venueId);

      // 利用権商品一覧を実データで取得
      const rawProducts = await client.listUsageProducts(venue.venueId);
      setProducts(
        rawProducts.map((p) => ({
          id: p.productId,
          name: p.name,
          // API の usageType は HOURLY/PACK/NIGHT/FLEX → UI では SEAT_TIME にマッピング
          usageType: 'SEAT_TIME' as UsageType,
          durationMinutes: p.baseDurationMinutes,
          priceMinor: p.basePriceMinor,
          depositRequiredMinor: p.depositRequiredMinor,
          transferable: true,
          maxTransferCount: 1,
          status: 'ACTIVE' as UsageProduct['status'],
          // 集計 API 未実装のため 0 固定
          soldCount: 0,
          venueId: p.venueId,
          machineId: null,
        })),
      );
    } catch {
      // エラー時は空配列を維持（例外を上位に伝播させない）
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (p: UsageProduct) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      usageType: p.usageType,
      durationMinutes: String(p.durationMinutes),
      priceMinor: String(p.priceMinor / 100),
      depositRequiredMinor: String(p.depositRequiredMinor / 100),
      transferable: p.transferable,
      maxTransferCount: String(p.maxTransferCount),
    });
    setSaveError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { setSaveError('商品名を入力してください'); return; }
    if (!formData.priceMinor || Number(formData.priceMinor) <= 0) { setSaveError('価格を正しく入力してください'); return; }
    if (!formData.durationMinutes || Number(formData.durationMinutes) <= 0) { setSaveError('利用時間を正しく入力してください'); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const client = createNodeStayClient();

      // venueId が未取得の場合は再度取得する
      let venueId = currentVenueId;
      if (!venueId) {
        const venues = await client.listVenues();
        venueId = venues[0]?.venueId ?? '';
        if (venueId) setCurrentVenueId(venueId);
      }

      // 利用権商品を upsert（SEAT_TIME → HOURLY にマッピング）
      await client.upsertUsageProduct(venueId, {
        productName: formData.name,
        usageType: 'HOURLY',
        durationMinutes: parseInt(formData.durationMinutes, 10),
        priceJpyc: String(Math.round(parseInt(formData.priceMinor, 10) / 100)),
        transferable: formData.transferable,
        maxTransferCount: formData.transferable ? parseInt(formData.maxTransferCount, 10) : 0,
      });

      // 保存成功後に一覧をリロード
      await loadProducts();
      closeForm();
    } catch {
      setSaveError('保存に失敗しました。しばらく経ってから再試行してください。');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = (id: string) => {
    // ステータス個別変更 API が未実装のため、ローカル state のみ更新する
    // TODO: ステータス変更 API が実装されたら差し替える
    setTogglingId(id);
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status: p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }
          : p,
      ),
    );
    setTogglingId(null);
  };

  return {
    products,
    loading,
    editingProduct,
    formData,
    setFormData,
    showForm,
    openCreate,
    openEdit,
    closeForm,
    saving,
    saveError,
    handleSave,
    togglingId,
    handleToggleStatus,
  };
}
