'use client';

// 加盟店利用権商品管理ページ（View 層：useMerchantUsageProducts の戻り値を表示のみ）

import Link from 'next/link';
import { useMerchantUsageProducts } from '../../../hooks';
import type { UsageProduct, UsageType, ProductFormData } from '../../../hooks/useMerchantUsageProducts';

// ===== ユーティリティ =====
function formatJPYC(minor: number) {
  return (minor / 100).toLocaleString('ja-JP');
}
function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

// ===== 利用種別設定 =====
const USAGE_TYPE_CONFIG: Record<UsageType, { label: string; icon: string }> = {
  SEAT_TIME:    { label: '座席利用', icon: '🪑' },
  COMPUTE_TIME: { label: 'コンピュートレンタル', icon: '💻' },
  COMBINED:     { label: '複合', icon: '⚡' },
};

// ===== ステータスバッジ =====
const STATUS_CONFIG: Record<UsageProduct['status'], { label: string; badgeClass: string }> = {
  ACTIVE: { label: '販売中',   badgeClass: 'badge-green' },
  PAUSED: { label: '一時停止', badgeClass: 'badge-yellow' },
  DRAFT:  { label: '下書き',   badgeClass: 'badge-gray' },
};

// ===== 入力スタイル =====
const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white placeholder-slate-300';

// ===== 商品作成・編集フォームモーダル =====
function ProductFormModal({
  editing,
  data,
  onChange,
  onSave,
  onClose,
  saving,
  error,
}: {
  editing: UsageProduct | null;
  data: ProductFormData;
  onChange: (d: ProductFormData) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  const set = (field: keyof ProductFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...data, [field]: e.target.value });

  const setCheck = (field: keyof ProductFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...data, [field]: e.target.checked });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-slate-900">
            {editing ? '商品を編集' : '新しい商品を追加'}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        {/* フォーム */}
        <div className="flex flex-col gap-4">
          {/* 商品名 */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              商品名 <span className="text-red-500">*</span>
            </label>
            <input type="text" className={inputClass} placeholder="例：3時間パック" value={data.name} onChange={set('name')} />
          </div>

          {/* 利用種別 */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">利用種別</label>
            <select className={inputClass} value={data.usageType} onChange={set('usageType')}>
              {Object.entries(USAGE_TYPE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>

          {/* 利用時間・価格・デポジット */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                利用時間（分）<span className="text-red-500">*</span>
              </label>
              <input type="number" className={inputClass} placeholder="180" min="1" value={data.durationMinutes} onChange={set('durationMinutes')} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                価格（JPYC）<span className="text-red-500">*</span>
              </label>
              <input type="number" className={inputClass} placeholder="1500" min="0" step="100" value={data.priceMinor} onChange={set('priceMinor')} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              デポジット（JPYC）<span className="text-xs font-normal text-slate-400 ml-1">省略可（0 なら不要）</span>
            </label>
            <input type="number" className={inputClass} placeholder="0" min="0" step="100" value={data.depositRequiredMinor} onChange={set('depositRequiredMinor')} />
          </div>

          {/* 譲渡設定 */}
          <div className="border border-slate-100 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-brand-600"
                checked={data.transferable}
                onChange={setCheck('transferable')}
              />
              <span className="text-sm font-semibold text-slate-700">譲渡を許可する</span>
            </label>
            {data.transferable && (
              <div>
                <label className="text-sm text-slate-500 block mb-1.5">最大譲渡回数</label>
                <select className={inputClass} value={data.maxTransferCount} onChange={set('maxTransferCount')}>
                  <option value="1">1回まで</option>
                  <option value="2">2回まで</option>
                  <option value="3">3回まで</option>
                </select>
              </div>
            )}
          </div>

          {/* エラー */}
          {error && <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}
        </div>

        {/* ボタン */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1 py-2.5">
            キャンセル
          </button>
          <button onClick={onSave} disabled={saving} className="btn-primary flex-1 py-2.5">
            {saving ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                保存中...
              </span>
            ) : (editing ? '変更を保存' : '商品を追加')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 商品カード =====
function ProductCard({
  product,
  onEdit,
  onToggle,
  toggling,
}: {
  product: UsageProduct;
  onEdit: (p: UsageProduct) => void;
  onToggle: (id: string) => void;
  toggling: boolean;
}) {
  const statusCfg = STATUS_CONFIG[product.status];
  const typeCfg = USAGE_TYPE_CONFIG[product.usageType];

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{typeCfg.icon}</span>
            <span className="text-xs text-slate-400">{typeCfg.label}</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 truncate">{product.name}</h3>
        </div>
        <span className={statusCfg.badgeClass}>{statusCfg.label}</span>
      </div>

      {/* 詳細 */}
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">利用時間</span>
          <span className="font-semibold text-slate-800">{formatDuration(product.durationMinutes)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">価格</span>
          <span className="font-bold text-slate-900">{formatJPYC(product.priceMinor)} JPYC</span>
        </div>
        {product.depositRequiredMinor > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">デポジット</span>
            <span className="font-semibold text-slate-600">{formatJPYC(product.depositRequiredMinor)} JPYC</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">譲渡</span>
          <span className={`font-semibold ${product.transferable ? 'text-emerald-600' : 'text-slate-400'}`}>
            {product.transferable ? `可能（最大${product.maxTransferCount}回）` : '不可'}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-50 pt-2">
          <span className="text-slate-500">販売数</span>
          <span className="font-bold text-brand-700">{product.soldCount} 件</span>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onEdit(product)}
          className="btn-secondary flex-1 py-2 text-sm"
        >
          編集
        </button>
        <button
          onClick={() => onToggle(product.id)}
          disabled={toggling}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl border transition-colors ${
            product.status === 'ACTIVE'
              ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
          }`}
        >
          {toggling ? '更新中...' : product.status === 'ACTIVE' ? '一時停止' : '販売再開'}
        </button>
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function MerchantUsageProductsPage() {
  const {
    products,
    editingProduct,
    formData, setFormData,
    showForm, openCreate, openEdit, closeForm,
    saving, saveError, handleSave,
    togglingId, handleToggleStatus,
  } = useMerchantUsageProducts();

  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;
  const totalSold = products.reduce((sum, p) => sum + p.soldCount, 0);

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/merchant/dashboard" className="hover:text-slate-300 transition-colors">ダッシュボード</Link>
            <span>/</span>
            <span className="text-slate-300">利用権商品管理</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">利用権商品管理</h1>
              <p className="text-slate-400">
                販売中：<span className="text-white font-semibold ml-1">{activeCount}件</span>
                　累計販売：<span className="text-white font-semibold ml-1">{totalSold}件</span>
              </p>
            </div>
            <button onClick={openCreate} className="btn-jpyc py-2.5 text-sm">
              新しい商品を追加
            </button>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8">

        {/* 統計サマリー */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: '販売中商品', value: `${activeCount}件` },
            { label: '累計販売数', value: `${totalSold}件` },
            { label: '商品数（全体）', value: `${products.length}件` },
          ].map((stat) => (
            <div key={stat.label} className="card p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
              <p className="text-xl font-extrabold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* 商品グリッド */}
        {products.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📦</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">商品がありません</h3>
            <p className="text-slate-400 text-sm mb-6">最初の利用権商品を追加しましょう</p>
            <button onClick={openCreate} className="btn-primary">商品を追加する</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={openEdit}
                onToggle={handleToggleStatus}
                toggling={togglingId === product.id}
              />
            ))}
          </div>
        )}

        {/* 注意事項 */}
        <div className="mt-10 card p-5 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-700 mb-3">商品設定について</h3>
          <ul className="flex flex-col gap-2">
            {[
              '価格・デポジットは JPYC 単位で入力してください（例：1500 = 1500 JPYC）',
              '販売中商品は即時反映されます。変更は次回購入から適用されます',
              '譲渡設定はオンチェーンに記録されます。変更後の利用権から適用されます',
              '一時停止中は新規購入ができません。既存の利用権には影響しません',
            ].map((note) => (
              <li key={note} className="text-sm text-slate-500 flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 商品フォームモーダル */}
      {showForm && (
        <ProductFormModal
          editing={editingProduct}
          data={formData}
          onChange={setFormData}
          onSave={handleSave}
          onClose={closeForm}
          saving={saving}
          error={saveError}
        />
      )}
    </>
  );
}
