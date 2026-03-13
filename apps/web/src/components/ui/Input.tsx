'use client';

/**
 * Input コンポーネント
 * 統一されたスタイルとバリデーション状態を持つテキスト入力フィールド
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** フィールドラベル */
  label?: string;
  /** エラーメッセージ（表示時は赤枠になる） */
  error?: string;
  /** ヘルパーテキスト（エラーがない場合に表示） */
  hint?: string;
  /** 入力フィールドの左側に表示するアイコン */
  leftIcon?: ReactNode;
  /** 入力フィールドの右側に表示するアイコン */
  rightIcon?: ReactNode;
  /** サイズバリアント */
  size?: 'sm' | 'md' | 'lg';
  /** 幅いっぱいに広げるか */
  fullWidth?: boolean;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-4 py-3 text-base',
};

const iconPadding = {
  sm: { left: 'pl-9', right: 'pr-9' },
  md: { left: 'pl-10', right: 'pr-10' },
  lg: { left: 'pl-11', right: 'pr-11' },
};

const iconPosition = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      size = 'md',
      fullWidth = true,
      className = '',
      id: providedId,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const hasError = !!error;
    const describedBy = hasError ? errorId : hint ? hintId : undefined;

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {/* ラベル */}
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            {label}
            {props.required && (
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            )}
          </label>
        )}

        {/* 入力フィールドコンテナ */}
        <div className="relative">
          {/* 左アイコン */}
          {leftIcon && (
            <span
              className={`absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${iconPosition[size]}`}
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}

          {/* 入力フィールド */}
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={`
              block rounded-lg border bg-white
              transition-colors duration-150
              placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
              ${sizeStyles[size]}
              ${leftIcon ? iconPadding[size].left : ''}
              ${rightIcon ? iconPadding[size].right : ''}
              ${hasError
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'
              }
              ${fullWidth ? 'w-full' : ''}
              ${className}
            `}
            {...props}
          />

          {/* 右アイコン */}
          {rightIcon && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${iconPosition[size]}`}
              aria-hidden="true"
            >
              {rightIcon}
            </span>
          )}
        </div>

        {/* エラーメッセージ or ヒント */}
        {hasError ? (
          <p id={errorId} className="mt-1.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-sm text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
