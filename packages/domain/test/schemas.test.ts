import { describe, expect, it } from 'vitest';
import {
  MachineSchema,
  MachineSlotSchema,
  UsageProductSchema,
  UsageRightSchema,
  UsageListingSchema,
  ComputeProductSchema,
  ComputeRightSchema,
  ComputeJobSchema,
  MarketplaceListingSchema,
  RevenueProgramSchema,
  RevenueRightSchema,
  SessionSchema,
  LedgerEntrySchema,
  OutboxEventSchema,
  SettlementSchema,
  DisputeSchema,
  IdentityVerificationSchema,
} from '../src/index';

const now = new Date().toISOString();

describe('MachineFi ドメインスキーマ検証', () => {
  it('Machine スキーマをパースできる', () => {
    const m = MachineSchema.parse({
      machineId: 'machine-01',
      venueId: 'venue-01',
      ownerWallet: '0xABCDEF',
      machineClass: 'GPU',
      spec: { cpu: 'i7-12700', gpu: 'RTX3060', ramGb: 32 },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(m.machineId).toBe('machine-01');
    expect(m.machineClass).toBe('GPU');
  });

  it('MachineSlot スキーマをパースできる', () => {
    const s = MachineSlotSchema.parse({
      slotId: 'slot-01',
      machineId: 'machine-01',
      slotStart: now,
      slotEnd: now,
      slotType: 'USAGE',
      occupancyStatus: 'RESERVED',
      referenceType: 'USAGE_RIGHT',
      referenceId: 'ur-01',
      createdAt: now,
    });
    expect(s.slotId).toBe('slot-01');
    expect(s.slotType).toBe('USAGE');
  });

  it('UsageProduct スキーマをパースできる', () => {
    const p = UsageProductSchema.parse({
      productId: 'prod-01',
      venueId: 'venue-01',
      productName: '3時間パック',
      usageType: 'PACK',
      durationMinutes: 180,
      transferable: true,
      priceJpyc: '300000000000000000000',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(p.productId).toBe('prod-01');
    expect(p.transferable).toBe(true);
  });

  it('UsageRight スキーマをパースできる', () => {
    const r = UsageRightSchema.parse({
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
    expect(r.usageRightId).toBe('ur-01');
    expect(r.status).toBe('MINTED');
  });

  it('UsageListing スキーマをパースできる', () => {
    const l = UsageListingSchema.parse({
      listingId: 'listing-01',
      usageRightId: 'ur-01',
      sellerUserId: 'user-01',
      priceJpyc: '250000000000000000000',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(l.listingId).toBe('listing-01');
  });

  it('ComputeProduct スキーマをパースできる', () => {
    const cp = ComputeProductSchema.parse({
      productId: 'cp-01',
      machineId: 'machine-01',
      computeTier: 'RTX3060',
      startWindow: now,
      endWindow: now,
      maxDurationMinutes: 120,
      preemptible: true,
      settlementPolicy: 'PRO_RATA',
      priceJpyc: '500000000000000000000',
      status: 'ACTIVE',
      createdAt: now,
    });
    expect(cp.productId).toBe('cp-01');
    expect(cp.preemptible).toBe(true);
  });

  it('ComputeRight スキーマをパースできる', () => {
    const cr = ComputeRightSchema.parse({
      computeRightId: 'cr-01',
      productId: 'cp-01',
      machineId: 'machine-01',
      ownerUserId: 'user-01',
      status: 'ISSUED',
      createdAt: now,
      updatedAt: now,
    });
    expect(cr.computeRightId).toBe('cr-01');
  });

  it('ComputeJob スキーマをパースできる', () => {
    const job = ComputeJobSchema.parse({
      jobId: 'job-01',
      buyerUserId: 'user-01',
      jobType: 'ML_INFERENCE',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
    expect(job.jobId).toBe('job-01');
    expect(job.status).toBe('PENDING');
  });

  it('MarketplaceListing スキーマをパースできる', () => {
    const ml = MarketplaceListingSchema.parse({
      listingId: 'ml-01',
      listingType: 'USAGE',
      assetId: 'ur-01',
      sellerUserId: 'user-01',
      priceJpyc: '280000000000000000000',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(ml.listingType).toBe('USAGE');
  });

  it('RevenueProgram スキーマをパースできる（Phase 3）', () => {
    const rp = RevenueProgramSchema.parse({
      programId: 'rp-01',
      machineId: 'machine-01',
      shareBps: 2000, // 20%
      revenueScope: 'ALL',
      startAt: now,
      endAt: now,
      settlementCycle: 'WEEKLY',
      payoutToken: 'JPYC',
      status: 'ISSUED',
      createdAt: now,
    });
    expect(rp.shareBps).toBe(2000);
  });

  it('RevenueProgram の shareBps は 40% (4000bps) を超えられない', () => {
    expect(() =>
      RevenueProgramSchema.parse({
        programId: 'rp-02',
        machineId: 'machine-01',
        shareBps: 4001,
        revenueScope: 'ALL',
        startAt: now,
        endAt: now,
        settlementCycle: 'WEEKLY',
        payoutToken: 'JPYC',
        status: 'ISSUED',
        createdAt: now,
      }),
    ).toThrow();
  });

  it('RevenueRight スキーマをパースできる', () => {
    const rr = RevenueRightSchema.parse({
      revenueRightId: 'rr-01',
      programId: 'rp-01',
      machineId: 'machine-01',
      holderUserId: 'user-01',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    expect(rr.revenueRightId).toBe('rr-01');
  });

  it('Session スキーマをパースできる（新規格：usageRightId）', () => {
    const s = SessionSchema.parse({
      sessionId: 'sess-01',
      usageRightId: 'ur-01',
      userId: 'user-01',
      venueId: 'venue-01',
      status: 'IN_USE',
      checkinMethod: 'QR',
      createdAt: now,
      updatedAt: now,
    });
    expect(s.sessionId).toBe('sess-01');
    expect(s.usageRightId).toBe('ur-01');
  });

  it('LedgerEntry スキーマをパースできる（新規格：entryType）', () => {
    const e = LedgerEntrySchema.parse({
      entryId: 'le-01',
      entryType: 'PAYMENT',
      referenceType: 'USAGE',
      referenceId: 'ur-01',
      amountJpyc: '300000000000000000000',
      status: 'PENDING',
      createdAt: now,
    });
    expect(e.entryId).toBe('le-01');
    expect(e.entryType).toBe('PAYMENT');
  });

  it('OutboxEvent スキーマをパースできる', () => {
    const o = OutboxEventSchema.parse({
      eventId: 'oe-01',
      eventType: 'CHAIN_TRANSFER',
      ledgerEntryId: 'le-01',
      status: 'NEW',
      createdAt: now,
    });
    expect(o.eventId).toBe('oe-01');
  });

  it('Settlement スキーマをパースできる（三方分配）', () => {
    const s = SettlementSchema.parse({
      settlementId: 'st-01',
      venueId: 'venue-01',
      settlementType: 'USAGE',
      grossAmountJpyc: '1000000000000000000000',
      venueShareJpyc: '750000000000000000000',
      platformShareJpyc: '250000000000000000000',
      revenueShareJpyc: '0',
      status: 'PENDING',
      createdAt: now,
    });
    expect(s.settlementId).toBe('st-01');
    expect(s.revenueShareJpyc).toBe('0');
  });

  it('Dispute スキーマをパースできる（新規格：referenceType）', () => {
    const d = DisputeSchema.parse({
      disputeId: 'd-01',
      referenceType: 'USAGE_RIGHT',
      referenceId: 'ur-01',
      openerUserId: 'user-01',
      status: 'OPEN',
      createdAt: now,
    });
    expect(d.disputeId).toBe('d-01');
    expect(d.referenceType).toBe('USAGE_RIGHT');
  });

  it('IdentityVerification スキーマをパースできる', () => {
    const iv = IdentityVerificationSchema.parse({
      identityVerificationId: 'iv-01',
      userId: 'user-01',
      venueId: 'venue-01',
      method: 'DRIVER_LICENSE',
      verifiedAt: now,
      verifier: 'STAFF',
      capturedFields: { name: '山田太郎', birthDate: '1990-01-01', address: '東京都' },
      retentionUntil: now,
    });
    expect(iv.identityVerificationId).toBe('iv-01');
  });
});
