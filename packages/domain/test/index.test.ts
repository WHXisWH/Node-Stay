import { describe, expect, it } from 'vitest';
import {
  addMoney,
  normalizeIdempotencyKey,
  VenueSchema,
  MachineSchema,
  UsageRightSchema,
  checkTransferAllowed,
} from '../src/index';

const now = new Date().toISOString();

describe('domain index エクスポート確認', () => {
  it('addMoney が正しく動作する', () => {
    expect(
      addMoney({ currency: 'JPYC', amountMinor: 1 }, { currency: 'JPYC', amountMinor: 2 }).amountMinor,
    ).toBe(3);
  });

  it('normalizeIdempotencyKey が正しく動作する', () => {
    expect(normalizeIdempotencyKey('abcDEF12')).toBe('abcDEF12');
  });

  it('VenueSchema が不正入力で失敗する', () => {
    expect(() => VenueSchema.parse({})).toThrow();
  });

  it('MachineSchema が正しくエクスポートされている', () => {
    const m = MachineSchema.parse({
      machineId: 'm1',
      venueId: 'v1',
      ownerWallet: '0x123',
      machineClass: 'STANDARD',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(m.machineId).toBe('m1');
  });

  it('checkTransferAllowed が転送可能なUsageRightを正しく判定する', () => {
    const right = UsageRightSchema.parse({
      usageRightId: 'ur-01',
      usageProductId: 'prod-01',
      ownerUserId: 'user-01',
      usageType: 'PACK',
      transferable: true,
      transferCount: 0,
      maxTransferCount: 1,
      kycLevelRequired: 0,
      status: 'MINTED',
      createdAt: now,
      updatedAt: now,
    });
    const result = checkTransferAllowed(right, new Date());
    expect(result.allowed).toBe(true);
  });

  it('checkTransferAllowed が CHECKED_IN の権利を転送不可と判定する', () => {
    const right = UsageRightSchema.parse({
      usageRightId: 'ur-02',
      usageProductId: 'prod-01',
      ownerUserId: 'user-01',
      usageType: 'PACK',
      transferable: true,
      transferCount: 0,
      maxTransferCount: 1,
      kycLevelRequired: 0,
      status: 'CHECKED_IN',
      createdAt: now,
      updatedAt: now,
    });
    const result = checkTransferAllowed(right, new Date());
    expect(result.allowed).toBe(false);
  });
});
