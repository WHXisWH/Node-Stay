import { z } from 'zod';

// スロット種別：USAGE（使用権）/ COMPUTE（算力権）/ BLOCKED（管理ブロック）
export const SlotTypeSchema = z.enum(['USAGE', 'COMPUTE', 'BLOCKED']);
export type SlotType = z.infer<typeof SlotTypeSchema>;

// スロット占有状態
export const OccupancyStatusSchema = z.enum(['FREE', 'RESERVED', 'CONSUMED', 'BLOCKED']);
export type OccupancyStatus = z.infer<typeof OccupancyStatusSchema>;

// 参照元種別（どの権利がこのスロットを占有しているか）
export const SlotReferenceTypeSchema = z.enum([
  'USAGE_RIGHT',
  'COMPUTE_RIGHT',
  'SESSION',
]);
export type SlotReferenceType = z.infer<typeof SlotReferenceTypeSchema>;

// 時間スロット
// 同一機器で同一時間帯の二重売り（Double Sell）を防ぐために使用
export const MachineSlotSchema = z.object({
  slotId: z.string().min(1),
  machineId: z.string().min(1),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  slotType: SlotTypeSchema,
  occupancyStatus: OccupancyStatusSchema,
  referenceType: SlotReferenceTypeSchema.optional(),
  referenceId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});
export type MachineSlot = z.infer<typeof MachineSlotSchema>;

// スロット競合チェック用のリクエスト型
export const SlotConflictCheckSchema = z.object({
  machineId: z.string().min(1),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  slotType: SlotTypeSchema,
});
export type SlotConflictCheck = z.infer<typeof SlotConflictCheckSchema>;
