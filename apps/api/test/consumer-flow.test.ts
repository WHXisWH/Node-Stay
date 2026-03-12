import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestToken, authHeader, getTestWallet } from './helpers/auth.helper';

/**
 * 消費者メインフロー統合テスト:
 * - 購入時に ownerUserId が正しく設定される (fix1)
 * - チェックイン時に JWT 認証ユーザーが使用される (fix2)
 * - チェックインのバリデーション (fix3)
 * - セッション一覧取得 (fix4)
 * - 店舗一覧が動的データを返す (fix5)
 * - チェックアウト時に実際の料金が返される (fix6)
 */
describe('Consumer main flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let venueId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    token = createTestToken();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 15000);

  // -----------------------------------------------------------------------
  // Fix5: 店舗一覧の動的データ
  // -----------------------------------------------------------------------

  describe('venue listing with dynamic data', () => {
    it('GET /v1/venues returns amenities, totalSeats, cheapestPlanMinor, availableSeats', async () => {
      const res = await request(app.getHttpServer()).get('/v1/venues');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      const venue = res.body[0];
      venueId = venue.id;
      expect(venue.amenities).toBeDefined();
      expect(Array.isArray(venue.amenities)).toBe(true);
      expect(venue.totalSeats).toBeDefined();
      expect(typeof venue.totalSeats).toBe('number');
      expect(venue.cheapestPlanMinor).toBeDefined();
      expect(typeof venue.cheapestPlanMinor).toBe('number');
      expect(venue.availableSeats).toBeDefined();
      expect(typeof venue.availableSeats).toBe('number');
    });

    it('GET /v1/venues/:id/plans returns products', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/venues/${venueId}/plans`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      productId = res.body[0].id;
    });
  });

  // -----------------------------------------------------------------------
  // Fix1: 購入時の ownerUserId
  // -----------------------------------------------------------------------

  describe('purchase sets ownerUserId correctly', () => {
    let usageRightId: string;

    it('POST /v1/usage-rights/purchase creates right with owner', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/usage-rights/purchase')
        .set(...authHeader(token))
        .set('Idempotency-Key', `purchase-owner-${Date.now()}`)
        .send({ productId });
      expect(res.status).toBe(201);
      expect(res.body.usageRightId).toBeDefined();
      usageRightId = res.body.usageRightId;
    });

    it('purchased right has non-null ownerUserId in DB', async () => {
      const right = await prisma.usageRight.findUnique({ where: { id: usageRightId } });
      expect(right).not.toBeNull();
      expect(right!.ownerUserId).not.toBeNull();
    });

    it('GET /v1/usage-rights lists the purchased right for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/usage-rights')
        .set(...authHeader(token));
      expect(res.status).toBe(200);
      const ids = res.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(usageRightId);
    });
  });

  // -----------------------------------------------------------------------
  // Fix2 & Fix3: チェックイン バリデーション
  // -----------------------------------------------------------------------

  describe('checkin validation', () => {
    let validUsageRightId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/usage-rights/purchase')
        .set(...authHeader(token))
        .set('Idempotency-Key', `purchase-validate-${Date.now()}`)
        .send({ productId });
      validUsageRightId = res.body.usageRightId;
    });

    it('rejects checkin with non-existent usageRightId', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: 'nonexistent-id', venueId });
      expect(res.status).toBe(404);
    });

    it('rejects checkin with wrong venueId', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: validUsageRightId, venueId: 'wrong-venue-id' });
      expect(res.status).toBe(422);
    });

    it('accepts valid checkin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: validUsageRightId, venueId });
      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeDefined();
    });

    it('rejects double checkin (status is CHECKED_IN, not MINTED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: validUsageRightId, venueId });
      expect(res.status).toBe(422);
    });
  });

  // -----------------------------------------------------------------------
  // Fix2: チェックイン uses real user, not demo user
  // -----------------------------------------------------------------------

  describe('checkin uses authenticated user', () => {
    let sessionId: string;

    beforeAll(async () => {
      const purchase = await request(app.getHttpServer())
        .post('/v1/usage-rights/purchase')
        .set(...authHeader(token))
        .set('Idempotency-Key', `purchase-auth-user-${Date.now()}`)
        .send({ productId });
      const usageRightId = purchase.body.usageRightId;

      const checkin = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId, venueId });
      sessionId = checkin.body.sessionId;
    });

    it('session userId matches authenticated user', async () => {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });
      expect(session).not.toBeNull();
      expect(session!.user.walletAddress?.toLowerCase()).toBe(getTestWallet().toLowerCase());
    });
  });

  // -----------------------------------------------------------------------
  // Fix4: セッション一覧
  // -----------------------------------------------------------------------

  describe('session listing', () => {
    it('GET /v1/sessions returns sessions for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/sessions')
        .set(...authHeader(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /v1/sessions?status=IN_USE filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/sessions?status=IN_USE')
        .set(...authHeader(token));
      expect(res.status).toBe(200);
      for (const s of res.body) {
        expect(s.status).toBe('IN_USE');
      }
    });

    it('GET /v1/sessions without auth returns 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/sessions');
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Fix6: チェックアウト時の精算金額
  // -----------------------------------------------------------------------

  describe('checkout returns real charges', () => {
    let sessionId: string;

    beforeAll(async () => {
      const purchase = await request(app.getHttpServer())
        .post('/v1/usage-rights/purchase')
        .set(...authHeader(token))
        .set('Idempotency-Key', `purchase-charges-${Date.now()}`)
        .send({ productId });

      const checkin = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: purchase.body.usageRightId, venueId });
      sessionId = checkin.body.sessionId;
    });

    it('checkout response includes charges with baseMinor from product', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/sessions/checkout')
        .set(...authHeader(token))
        .set('Idempotency-Key', `checkout-charges-${Date.now()}`)
        .send({ sessionId });
      expect(res.status).toBe(201);
      expect(res.body.usedMinutes).toBeGreaterThanOrEqual(0);
      expect(res.body.charges).toBeDefined();
      expect(typeof res.body.charges.baseMinor).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // getSession with baseDurationMinutes / basePriceMinor
  // -----------------------------------------------------------------------

  describe('getSession returns product info', () => {
    let sessionId: string;

    beforeAll(async () => {
      const purchase = await request(app.getHttpServer())
        .post('/v1/usage-rights/purchase')
        .set(...authHeader(token))
        .set('Idempotency-Key', `purchase-getsession-${Date.now()}`)
        .send({ productId });

      const checkin = await request(app.getHttpServer())
        .post('/v1/sessions/checkin')
        .set(...authHeader(token))
        .send({ usageRightId: purchase.body.usageRightId, venueId });
      sessionId = checkin.body.sessionId;
    });

    it('GET /v1/sessions/:id includes baseDurationMinutes and basePriceMinor', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/sessions/${sessionId}`)
        .set(...authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(typeof res.body.baseDurationMinutes).toBe('number');
      expect(res.body.baseDurationMinutes).toBeGreaterThan(0);
      expect(typeof res.body.basePriceMinor).toBe('number');
    });
  });
});
