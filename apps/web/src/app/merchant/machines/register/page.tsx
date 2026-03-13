'use client';

// マシン登録フォームページ（View 層）

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createNodeStayClient } from '../../../../services/nodestay';

type MachineClass = 'GPU' | 'CPU' | 'PREMIUM' | 'STANDARD';

interface RegisterForm {
  venueId: string;
  machineClass: MachineClass;
  label: string;
  cpu: string;
  gpu: string;
  ramGb: string;
  storageGb: string;
  localSerial: string;
  metadataUri: string;
}

const MACHINE_CLASS_OPTIONS: { value: MachineClass; label: string; description: string; icon: string }[] = [
  { value: 'GPU',      label: 'GPU ステーション',   description: 'GPU 搭載マシン・AI学習・レンダリング向け',  icon: '🎮' },
  { value: 'CPU',      label: 'CPU サーバー',       description: 'ハイコア CPU・ZKP・並列計算向け',          icon: '💻' },
  { value: 'PREMIUM',  label: 'プレミアム席',        description: '高スペック・個室・プライベートブース向け', icon: '⭐' },
  { value: 'STANDARD', label: 'スタンダード席',      description: '標準スペック・一般利用向け',               icon: '🖥' },
];

// ===== フォームフィールドコンポーネント =====
function FormField({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ===== 入力スタイル =====
const inputClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white placeholder-slate-300';

// ===== ページコンポーネント =====
export default function MachineRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterForm>({
    venueId: '',
    machineClass: 'GPU',
    label: '',
    cpu: '',
    gpu: '',
    ramGb: '',
    storageGb: '',
    localSerial: '',
    metadataUri: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [venues, setVenues] = useState<Array<{ venueId: string; name: string }>>([]);

  useEffect(() => {
    void (async () => {
      setLoadingVenues(true);
      try {
        const client = createNodeStayClient();
        const merchantVenues = await client.listMyMerchantVenues().catch(() => []);
        const rows = merchantVenues.length > 0 ? merchantVenues : await client.listVenues();
        const options = rows.map((v) => ({ venueId: v.venueId, name: v.name }));
        setVenues(options);
        setForm((prev) => ({
          ...prev,
          venueId: prev.venueId || options[0]?.venueId || '',
        }));
      } catch {
        setVenues([]);
      } finally {
        setLoadingVenues(false);
      }
    })();
  }, []);

  const set = (field: keyof RegisterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClassSelect = (cls: MachineClass) =>
    setForm((prev) => ({ ...prev, machineClass: cls, gpu: cls === 'GPU' ? prev.gpu : '' }));

  const validate = () => {
    if (!form.venueId.trim()) return '店舗を選択してください';
    if (!form.label.trim()) return 'マシン名を入力してください';
    if (!form.cpu.trim()) return 'CPU モデルを入力してください';
    if (!form.ramGb || Number(form.ramGb) <= 0) return 'RAM（GB）を正しく入力してください';
    if (!form.storageGb || Number(form.storageGb) <= 0) return 'ストレージ（GB）を正しく入力してください';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setSubmitting(true);
    setError(null);

    try {
      const client = createNodeStayClient();
      await client.registerMachine({
        venueId: form.venueId,
        machineClass: form.machineClass,
        cpu: form.cpu.trim(),
        gpu: form.gpu.trim() || undefined,
        ramGb: Number(form.ramGb),
        storageGb: Number(form.storageGb),
        localSerial: form.localSerial.trim() || undefined,
        metadataUri: form.metadataUri.trim() || undefined,
      });
      router.push('/merchant/machines?registered=1');
    } catch (submitError: unknown) {
      const msg = submitError instanceof Error ? submitError.message : '';
      const jsonStart = msg.indexOf('{');
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(msg.slice(jsonStart)) as { message?: string };
          if (parsed.message) {
            setError(parsed.message);
            return;
          }
        } catch {
          // JSON 解析に失敗した場合は共通メッセージを表示する
        }
      }
      setError('登録に失敗しました。しばらく経ってから再試行してください。');
    } finally {
      setSubmitting(false);
    }
  };

  const isGpu = form.machineClass === 'GPU';

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
            <Link href="/merchant/machines" className="hover:text-slate-300 transition-colors">マシン管理</Link>
            <span>/</span>
            <span className="text-slate-300">マシン登録</span>
          </nav>
          <h1 className="text-3xl font-extrabold text-white mb-2">マシン登録</h1>
          <p className="text-slate-400">新しいマシンを登録して利用権の販売を開始します</p>
        </div>
      </div>

      {/* フォーム */}
      <div className="container-main py-10">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex flex-col gap-8">

          {/* エラーバナー */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* STEP 1: マシンクラス */}
          <div className="card p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">STEP 1 — マシンクラスを選択</h2>
            <p className="text-xs text-slate-400 mb-5">マシンの用途・スペックに合ったクラスを選んでください</p>
            <div className="grid grid-cols-2 gap-3">
              {MACHINE_CLASS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleClassSelect(opt.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all duration-150 ${
                    form.machineClass === opt.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{opt.icon}</div>
                  <p className="text-sm font-bold text-slate-900 mb-1">{opt.label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 2: 基本情報 */}
          <div className="card p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">STEP 2 — マシン情報</h2>
              <p className="text-xs text-slate-400">スペックはオンチェーンのハッシュとして記録されます</p>
            </div>

            <FormField label="登録先店舗" required hint="このマシンを紐づける店舗を選択してください">
              <select
                className={inputClass}
                value={form.venueId}
                onChange={set('venueId')}
                disabled={loadingVenues}
              >
                {loadingVenues && <option value="">店舗情報を読み込み中...</option>}
                {!loadingVenues && venues.length === 0 && <option value="">登録可能な店舗がありません</option>}
                {!loadingVenues && venues.length > 0 && venues.map((venue) => (
                  <option key={venue.venueId} value={venue.venueId}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="マシン名（管理用）" required hint="例：GPU ステーション A-03、プレミアム席 P-02">
              <input
                type="text"
                className={inputClass}
                placeholder="マシン名を入力"
                value={form.label}
                onChange={set('label')}
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="CPU モデル" required hint="例：Core i9-13900K">
                <input type="text" className={inputClass} placeholder="CPU モデル" value={form.cpu} onChange={set('cpu')} />
              </FormField>

              {isGpu && (
                <FormField label="GPU モデル" hint="例：RTX 4090">
                  <input type="text" className={inputClass} placeholder="GPU モデル（省略可）" value={form.gpu} onChange={set('gpu')} />
                </FormField>
              )}

              <FormField label="RAM（GB）" required>
                <input type="number" className={inputClass} placeholder="例：64" min="1" value={form.ramGb} onChange={set('ramGb')} />
              </FormField>

              <FormField label="ストレージ（GB）" required>
                <input type="number" className={inputClass} placeholder="例：2000" min="1" value={form.storageGb} onChange={set('storageGb')} />
              </FormField>
            </div>

            <FormField label="シリアル番号（任意）" hint="店舗側管理用の識別子。オンチェーンには公開されません">
              <input type="text" className={inputClass} placeholder="LOCAL-SN-XXXX" value={form.localSerial} onChange={set('localSerial')} />
            </FormField>

            <FormField label="メタデータ URI（任意）" hint="IPFS 等のメタデータリンク。マシンNFTに付与されます">
              <input type="text" className={inputClass} placeholder="ipfs://..." value={form.metadataUri} onChange={set('metadataUri')} />
            </FormField>
          </div>

          {/* STEP 3: 確認と登録 */}
          <div className="card p-6 bg-slate-50">
            <h2 className="text-base font-bold text-slate-900 mb-4">STEP 3 — 登録内容の確認</h2>
            <div className="flex flex-col gap-2 text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">登録先店舗</span>
                <span className="font-semibold text-slate-800">
                  {venues.find((v) => v.venueId === form.venueId)?.name ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">マシンクラス</span>
                <span className="font-semibold text-slate-800">
                  {MACHINE_CLASS_OPTIONS.find((o) => o.value === form.machineClass)?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">マシン名</span>
                <span className="font-semibold text-slate-800">{form.label || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CPU</span>
                <span className="font-semibold text-slate-800">{form.cpu || '—'}</span>
              </div>
              {isGpu && (
                <div className="flex justify-between">
                  <span className="text-slate-500">GPU</span>
                  <span className="font-semibold text-slate-800">{form.gpu || '—'}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">RAM / ストレージ</span>
                <span className="font-semibold text-slate-800">
                  {form.ramGb ? `${form.ramGb} GB` : '—'} / {form.storageGb ? `${form.storageGb} GB` : '—'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 bg-white rounded-lg p-3 mb-5 leading-relaxed">
              ※ 登録後、マシンは NodeStay MachineRegistry コントラクトにオンチェーン記録されます。
              ガス代（MATIC）が必要な場合があります。登録完了後に利用権商品を設定できます。
            </p>

            {/* ボタン群 */}
            <div className="flex gap-3">
              <Link href="/merchant/machines" className="btn-secondary flex-1 text-center py-3">
                キャンセル
              </Link>
              <button
                type="submit"
                disabled={submitting || loadingVenues || venues.length === 0}
                className="btn-primary flex-1 py-3"
              >
                {submitting ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    登録中...
                  </span>
                ) : loadingVenues ? (
                  '店舗情報を読み込み中...'
                ) : (
                  'マシンを登録する'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
