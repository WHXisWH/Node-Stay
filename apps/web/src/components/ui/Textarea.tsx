'use client';

/**
 * Textarea コンポーネント
 * 統一されたスタイルとバリデーション状態を持つテキストエリア
 */

import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** フィールドラベル */
  label?: string;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  hint?: string;
  /** 幅いっぱいに広げるか */
  fullWidth?: boolean;
  /** 文字数カウンターを表示するか */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      fullWidth = true,
      showCount = false,
      className = '',
      id: providedId,
      disabled,
      maxLength,
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

    const currentLength = typeof value === 'string' ? value.length : 0;

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

        {/* テキストエリア */}
        <textarea
          ref={ref}
          id={id}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className={`
            block rounded-lg border bg-white
            px-4 py-3 text-sm
            transition-colors duration-150
            placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
            resize-y min-h-[100px]
            ${hasError
              ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
              : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'
            }
            ${fullWidth ? 'w-full' : ''}
            ${className}
          `}
          {...props}
        />

        {/* フッター行（エラー/ヒント + 文字数） */}
        <div className="flex justify-between items-start mt-1.5 gap-4">
          {/* エラーメッセージ or ヒント */}
          <div className="flex-1">
            {hasError ? (
              <p id={errorId} className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : hint ? (
              <p id={hintId} className="text-sm text-slate-500">
                {hint}
              </p>
            ) : null}
          </div>

          {/* 文字数カウンター */}
          {showCount && maxLength && (
            <p
              className={`text-sm flex-shrink-0 ${
                currentLength >= maxLength ? 'text-red-600' : 'text-slate-400'
              }`}
            >
              {currentLength} / {maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
