'use client';

/**
 * Select コンポーネント
 * 統一されたスタイルとバリデーション状態を持つセレクトボックス
 */

import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** フィールドラベル */
  label?: string;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  hint?: string;
  /** 選択肢の配列 */
  options: SelectOption[];
  /** プレースホルダー（未選択時の表示） */
  placeholder?: string;
  /** サイズバリアント */
  size?: 'sm' | 'md' | 'lg';
  /** 幅いっぱいに広げるか */
  fullWidth?: boolean;
  /** 左側アイコン */
  leftIcon?: ReactNode;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm pr-8',
  md: 'px-4 py-2.5 text-sm pr-10',
  lg: 'px-4 py-3 text-base pr-10',
};

const iconPadding = {
  sm: 'pl-9',
  md: 'pl-10',
  lg: 'pl-11',
};

const iconPosition = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      size = 'md',
      fullWidth = true,
      leftIcon,
      className = '',
      id: providedId,
      disabled,
      value,
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

    // 未選択状態かどうか
    const isPlaceholder = value === '' || value === undefined;

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

        {/* セレクトコンテナ */}
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

          {/* セレクトボックス */}
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            value={value}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={`
              block rounded-lg border bg-white appearance-none cursor-pointer
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
              ${sizeStyles[size]}
              ${leftIcon ? iconPadding[size] : ''}
              ${isPlaceholder ? 'text-slate-400' : 'text-slate-900'}
              ${hasError
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'
              }
              ${fullWidth ? 'w-full' : ''}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* ドロップダウン矢印 */}
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
            aria-hidden="true"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
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

Select.displayName = 'Select';
