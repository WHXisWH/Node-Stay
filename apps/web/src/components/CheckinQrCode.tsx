'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';

interface CheckinQrCodeProps {
  usageRightId: string;
  venueId: string;
  size?: number;
}

/**
 * チェックイン用 QR コード。
 * スマートフォンでそのまま開けるよう、/sessions/checkin への URL を埋め込む。
 * ts は短時間で更新し、古い QR の再利用を抑止するための目印として付与する。
 */
export function CheckinQrCode({ usageRightId, venueId, size = 192 }: CheckinQrCodeProps) {
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOrigin(window.location.origin);
  }, []);

  const ts = Math.floor(Date.now() / 300_000) * 300;
  const payload = useMemo(() => {
    if (!origin) return '';
    const qs = new URLSearchParams({
      usageRightId,
      venueId,
      ts: String(ts),
    });
    return `${origin}/sessions/checkin?${qs.toString()}`;
  }, [origin, usageRightId, venueId, ts]);

  if (!payload) {
    return (
      <div className="bg-white p-3 rounded-2xl inline-block">
        <div
          className="rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          QR 生成中...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-3 rounded-2xl inline-block">
      <QRCodeSVG
        value={payload}
        size={size}
        level="M"
        includeMargin={false}
        bgColor="#ffffff"
        fgColor="#0f172a"
      />
    </div>
  );
}
