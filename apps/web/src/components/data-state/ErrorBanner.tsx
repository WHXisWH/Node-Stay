'use client';

interface ErrorBannerProps {
  message: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = '再読み込み',
  className,
}: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 ${className ?? ''}`.trim()}>
      <p className="text-sm text-rose-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
