import { z } from 'zod';

// 機器クラス（GPU搭載・一般PC・高性能など）
export const MachineClassSchema = z.enum(['GPU', 'CPU', 'STANDARD', 'PREMIUM']);
export type MachineClass = z.infer<typeof MachineClassSchema>;

// 機器ルートアセットのライフサイクル状態
export const MachineStatusSchema = z.enum([
  'REGISTERED',
  'ACTIVE',
  'PAUSED',
  'MAINTENANCE',
  'DECOMMISSIONED',
]);
export type MachineStatus = z.infer<typeof MachineStatusSchema>;

// 機器のハードウェアスペック
export const MachineSpecSchema = z.object({
  cpu: z.string().min(1).optional(),
  gpu: z.string().min(1).optional(),
  ramGb: z.number().int().positive().optional(),
  storageGb: z.number().int().positive().optional(),
  vram: z.number().int().nonnegative().optional(),
});
export type MachineSpec = z.infer<typeof MachineSpecSchema>;

// 機器ルートアセット
// machineId = keccak256(venueIdHash, localSerial, hardwareFingerprintHash, registrationNonce) で生成
export const MachineSchema = z.object({
  machineId: z.string().min(1),
  venueId: z.string().min(1),
  localSerial: z.string().min(1).optional(),
  hardwareFingerprintHash: z.string().min(1).optional(),
  ownerWallet: z.string().min(1),
  machineClass: MachineClassSchema,
  spec: MachineSpecSchema.optional(),
  specHash: z.string().min(1).optional(),
  metadataURI: z.string().min(1).optional(),
  onchainTokenId: z.string().min(1).optional(),
  onchainTxHash: z.string().min(1).optional(),
  status: MachineStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Machine = z.infer<typeof MachineSchema>;
