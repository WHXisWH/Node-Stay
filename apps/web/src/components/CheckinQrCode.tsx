'use client';

import { QRCodeSVG } from 'qrcode.react';

interface CheckinQrCodeProps {
  usageRightId: string;
  venueId: string;
  size?: number;
}

/**
 * チェックイン用 QR コード。
 * エンコード内容: JSON { type, usageRightId, venueId, ts }
 * - type: スキャナー側でチェックイン QR と判別するための固定値
 * - venueId: チェックイン先の店舗 ID
 * - ts: リプレイ防止用タイムスタンプ（秒単位、5分間隔で丸め）
 */
export function CheckinQrCode({ usageRightId, venueId, size = 192 }: CheckinQrCodeProps) {
  const ts = Math.floor(Date.now() / 300_000) * 300;
  const payload = JSON.stringify({ type: 'nodestay-checkin', usageRightId, venueId, ts });

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
