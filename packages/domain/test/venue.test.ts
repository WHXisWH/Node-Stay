import { describe, expect, it } from 'vitest';
import { VenueSchema } from '../src/venue';

const now = new Date().toISOString();

describe('VenueSchema', () => {
  it('最小構成の店舗をパースできる', () => {
    const v = VenueSchema.parse({
      venueId: 'v1',
      merchantId: 'merchant-01',
      name: 'テスト店',
      address: '東京都渋谷区',
      jurisdiction: { country: 'JP', prefecture: '東京都' },
      timezone: 'Asia/Tokyo',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(v.venueId).toBe('v1');
    expect(v.requiresKyc).toBe(false);
  });

  it('KYC必須・ウォレット設定を持つ店舗をパースできる', () => {
    const v = VenueSchema.parse({
      venueId: 'v2',
      merchantId: 'merchant-01',
      name: 'KYC必須店舗',
      address: '大阪府大阪市',
      jurisdiction: { country: 'JP', prefecture: '大阪府', city: '大阪市' },
      timezone: 'Asia/Tokyo',
      venueIdHash: '0xdeadbeef',
      requiresKyc: true,
      treasuryWallet: '0xABCDEF1234',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(v.requiresKyc).toBe(true);
    expect(v.venueIdHash).toBe('0xdeadbeef');
  });

  it('必須フィールドが欠けているとパースに失敗する', () => {
    expect(() => VenueSchema.parse({})).toThrow();
    expect(() => VenueSchema.parse({ venueId: 'v1' })).toThrow();
  });
});
