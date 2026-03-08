import { z } from 'zod';

// セッション状態（チェックイン〜チェックアウトのライフサイクル）
export const SessionStatusSchema = z.enum([
  'PENDING',    // チェックイン前
  'IN_USE',     // 使用中
  'COMPLETED',  // チェックアウト完了（精算済み）
  'DISPUTED',   // 異議申立中
  'CANCELLED',  // キャンセル
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// チェックイン方式
export const CheckInMethodSchema = z.enum(['QR', 'KIOSK', 'STAFF', 'NFC']);
export type CheckInMethod = z.infer<typeof CheckInMethodSchema>;

// 使用セッション
// UsageRight を消費する物理的な利用記録
export const SessionSchema = z.object({
  sessionId: z.string().min(1),
  usageRightId: z.string().min(1),       // 消費する使用権（旧: passId）
  userId: z.string().min(1),
  venueId: z.string().min(1),
  machineId: z.string().min(1).optional(),
  checkedInAt: z.string().datetime().optional(),
  checkedOutAt: z.string().datetime().optional(),
  status: SessionStatusSchema,
  checkinMethod: CheckInMethodSchema.optional(),
  evidenceHash: z.string().min(1).optional(),  // セッションログのハッシュアンカー（オンチェーン記録用）
  notes: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Session = z.infer<typeof SessionSchema>;
