'use client';

import type { ReactNode } from 'react';
import { ErrorBanner } from './ErrorBanner';

interface DataStateViewProps {
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loadingContent?: ReactNode;
  children: ReactNode;
}

function DefaultLoadingContent() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 flex flex-col gap-4">
          <div className="skeleton h-5 w-3/4 rounded" />
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-16 w-full rounded" />
          <div className="skeleton h-10 w-1/2 rounded mt-auto" />
        </div>
      ))}
    </div>
  );
}

export function DataStateView({
  loading,
  error,
  empty,
  onRetry,
  retryLabel,
  emptyTitle = 'データがありません',
  emptyDescription = '条件を変更して再度お試しください',
  emptyAction,
  loadingContent,
  children,
}: DataStateViewProps) {
  if (loading) {
    return <>{loadingContent ?? <DefaultLoadingContent />}</>;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={onRetry} retryLabel={retryLabel} />;
  }

  if (empty) {
    return (
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">{emptyTitle}</h3>
        <p className="text-slate-400 text-sm mb-6">{emptyDescription}</p>
        {emptyAction}
      </div>
    );
  }

  return <>{children}</>;
}
