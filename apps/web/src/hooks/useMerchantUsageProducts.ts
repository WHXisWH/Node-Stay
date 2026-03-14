/**
 * useMerchantUsageProducts: 加盟店利用権商品の Controller。
 * 未実装 API を使ったローカル擬似更新は行わない。
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
  loadError: string | null;
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
  togglingId: string | null;
  handleToggleStatus: (id: string) => void;
}

export function useMerchantUsageProducts(): UseMerchantUsageProductsReturn {
  const [products, setProducts] = useState<UsageProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentVenueId, setCurrentVenueId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<UsageProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const client = createNodeStayClient();
      const merchantVenues = await client.listMyMerchantVenues();
      const venue = merchantVenues[0];
      if (!venue) {
        setProducts([]);
        setCurrentVenueId('');
        setLoadError('加盟店店舗が見つかりません。先に加盟店ダッシュボードで店舗を作成してください。');
        return;
      }

      setCurrentVenueId(venue.venueId);
      const rawProducts = await client.listUsageProducts(venue.venueId);
      setProducts(
        rawProducts.map((p) => ({
          id: p.productId,
          name: p.name,
          usageType: 'SEAT_TIME',
          durationMinutes: p.baseDurationMinutes,
          priceMinor: p.basePriceMinor,
          depositRequiredMinor: p.depositRequiredMinor,
          transferable: true,
          maxTransferCount: 1,
          status: 'ACTIVE',
          soldCount: 0,
          venueId: p.venueId,
          machineId: null,
        })),
      );
    } catch {
      setProducts([]);
      setCurrentVenueId('');
      setLoadError('利用権商品の取得に失敗しました。ログイン状態と権限を確認してください。');
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
    if (!formData.name.trim()) {
      setSaveError('商品名を入力してください');
      return;
    }
    if (!formData.priceMinor || Number(formData.priceMinor) <= 0) {
      setSaveError('価格を正しく入力してください');
      return;
    }
    if (!formData.durationMinutes || Number(formData.durationMinutes) <= 0) {
      setSaveError('利用時間を正しく入力してください');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const client = createNodeStayClient();
      let venueId = currentVenueId;
      if (!venueId) {
        const merchantVenues = await client.listMyMerchantVenues();
        venueId = merchantVenues[0]?.venueId ?? '';
        if (venueId) setCurrentVenueId(venueId);
      }
      if (!venueId) {
        throw new Error('加盟店店舗が見つかりません');
      }

      await client.upsertUsageProduct(venueId, {
        productName: formData.name,
        usageType: 'HOURLY',
        durationMinutes: parseInt(formData.durationMinutes, 10),
        priceJpyc: String(Math.round(parseInt(formData.priceMinor, 10) / 100)),
        transferable: formData.transferable,
        maxTransferCount: formData.transferable ? parseInt(formData.maxTransferCount, 10) : 0,
      });

      await loadProducts();
      closeForm();
    } catch {
      setSaveError('保存に失敗しました。しばらくしてから再試行してください');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = (id: string) => {
    setTogglingId(id);
    setSaveError('状態切替 API は未実装です');
    setTogglingId(null);
  };

  return {
    products,
    loading,
    loadError,
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
