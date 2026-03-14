import { Suspense } from 'react';
import { SessionCheckinClient } from './SessionCheckinClient';

function CheckinLoadingFallback() {
  return (
    <div className="container-main py-16">
      <div className="max-w-xl mx-auto card p-6">
        <p className="text-sm text-slate-500">チェックイン情報を読み込み中...</p>
      </div>
    </div>
  );
}

export default function SessionCheckinPage() {
  return (
    <Suspense fallback={<CheckinLoadingFallback />}>
      <SessionCheckinClient />
    </Suspense>
  );
}
