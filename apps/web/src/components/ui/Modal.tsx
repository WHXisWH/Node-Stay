'use client';

/**
 * Modal コンポーネント
 * ESC キーで閉じる、フォーカストラップ、アニメーション付きのモーダルダイアログ
 */

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** モーダルのタイトル */
  title?: string;
  /** モーダルの説明文 */
  description?: string;
  /** モーダルのコンテンツ */
  children: ReactNode;
  /** モーダルの幅 */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** オーバーレイクリックで閉じるか */
  closeOnOverlayClick?: boolean;
  /** 閉じるボタンを表示するか */
  showCloseButton?: boolean;
  /** フッターコンテンツ（ボタン等） */
  footer?: ReactNode;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

// フォーカス可能な要素のセレクター
const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // フォーカス可能な要素を取得
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    );
  }, []);

  // フォーカストラップ処理
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // ESC キーで閉じる
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Tab キーでフォーカストラップ
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (e.shiftKey) {
          // Shift+Tab: 最初の要素から最後の要素へ
          if (activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: 最後の要素から最初の要素へ
          if (activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [onClose, getFocusableElements]
  );

  // オーバーレイクリック処理
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlayClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose]
  );

  // モーダル開閉時のフォーカス管理
  useEffect(() => {
    if (isOpen) {
      // 開く前のアクティブ要素を保存
      previousActiveElement.current = document.activeElement as HTMLElement;

      // body のスクロールを無効化
      document.body.style.overflow = 'hidden';

      // モーダル内の最初のフォーカス可能な要素にフォーカス
      requestAnimationFrame(() => {
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          modalRef.current?.focus();
        }
      });
    } else {
      // body のスクロールを復元
      document.body.style.overflow = '';

      // 元のアクティブ要素にフォーカスを戻す
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, getFocusableElements]);

  // モーダルが閉じている場合は何もレンダリングしない
  if (!isOpen) return null;

  // Portal でレンダリング
  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* モーダルコンテンツ */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`
          relative bg-white rounded-2xl shadow-xl
          w-full ${sizeStyles[size]}
          animate-slide-up
          max-h-[90vh] flex flex-col
        `}
      >
        {/* ヘッダー */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-5 border-b border-slate-200">
            <div className="flex-1 pr-4">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="mt-1 text-sm text-slate-500"
                >
                  {description}
                </p>
              )}
            </div>

            {/* 閉じるボタン */}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="
                  flex-shrink-0 p-2 -m-2
                  text-slate-400 hover:text-slate-600
                  rounded-lg hover:bg-slate-100
                  transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                "
                aria-label="閉じる"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* ボディ */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>

        {/* フッター */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // SSR 対応: document がある場合のみ Portal を使用
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
