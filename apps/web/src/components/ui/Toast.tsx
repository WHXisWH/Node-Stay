'use client';

/**
 * Toast 通知システム
 * 成功、エラー、警告、情報の4種類の通知を表示
 * 自動消去とスタック表示をサポート
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

// Toast の種類
export type ToastType = 'success' | 'error' | 'warning' | 'info';

// 個別の Toast 定義
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

// Toast コンテキストの型
interface ToastContextValue {
  /** 成功通知を表示 */
  success: (message: string, duration?: number) => void;
  /** エラー通知を表示 */
  error: (message: string, duration?: number) => void;
  /** 警告通知を表示 */
  warning: (message: string, duration?: number) => void;
  /** 情報通知を表示 */
  info: (message: string, duration?: number) => void;
  /** 通知を削除 */
  dismiss: (id: string) => void;
  /** 全ての通知を削除 */
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// デフォルトの表示時間（ミリ秒）
const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;

// 各種類のスタイル設定
const typeStyles: Record<ToastType, { bg: string; icon: ReactNode; iconBg: string }> = {
  success: {
    bg: 'bg-white border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-white border-red-200',
    iconBg: 'bg-red-100 text-red-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-white border-amber-200',
    iconBg: 'bg-amber-100 text-amber-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-white border-blue-200',
    iconBg: 'bg-blue-100 text-blue-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

// 個別の Toast アイテムコンポーネント
function ToastItemComponent({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const styles = typeStyles[toast.type];

  // 自動消去タイマー
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, toast.duration - 300);

    const removeTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        flex items-start gap-3 p-4 rounded-xl border shadow-lg
        transition-all duration-300 ease-out
        ${styles.bg}
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
    >
      {/* アイコン */}
      <span className={`flex-shrink-0 p-1.5 rounded-lg ${styles.iconBg}`}>
        {styles.icon}
      </span>

      {/* メッセージ */}
      <p className="flex-1 text-sm text-slate-700 pt-1">
        {toast.message}
      </p>

      {/* 閉じるボタン */}
      <button
        type="button"
        onClick={handleDismiss}
        className="
          flex-shrink-0 p-1
          text-slate-400 hover:text-slate-600
          rounded-lg hover:bg-slate-100
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-brand-500
        "
        aria-label="閉じる"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Toast コンテナコンポーネント
function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItemComponent toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// Toast プロバイダー
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 一意の ID を生成
  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Toast を追加
  const addToast = useCallback((type: ToastType, message: string, duration = DEFAULT_DURATION) => {
    const id = generateId();
    setToasts((prev) => {
      const newToasts = [...prev, { id, type, message, duration }];
      // 最大数を超えたら古いものから削除
      if (newToasts.length > MAX_TOASTS) {
        return newToasts.slice(-MAX_TOASTS);
      }
      return newToasts;
    });
  }, []);

  // Toast を削除
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 全ての Toast を削除
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  // 各種通知メソッド
  const success = useCallback(
    (message: string, duration?: number) => addToast('success', message, duration),
    [addToast]
  );
  const error = useCallback(
    (message: string, duration?: number) => addToast('error', message, duration),
    [addToast]
  );
  const warning = useCallback(
    (message: string, duration?: number) => addToast('warning', message, duration),
    [addToast]
  );
  const info = useCallback(
    (message: string, duration?: number) => addToast('info', message, duration),
    [addToast]
  );

  const contextValue: ToastContextValue = useMemo(() => ({
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  }), [success, error, warning, info, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// Toast を使用するためのフック
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast は ToastProvider 内で使用する必要があります');
  }
  return context;
}

// 後方互換性のためにコンポーネントとしてもエクスポート
export const Toast = {
  Provider: ToastProvider,
  useToast,
};
