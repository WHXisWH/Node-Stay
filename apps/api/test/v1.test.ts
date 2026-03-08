import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app.module';

describe('API v1 surface', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // 店舗・商品 エンドポイント
  // -----------------------------------------------------------------------

  it('GET /v1/venues → 配列を返す', async () => {
    const res = await request(app.getHttpServer()).get('/v1/venues');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/venues/:id/plans → 配列を返す（存在しない場合は空）', async () => {
    const res = await request(app.getHttpServer()).get('/v1/venues/nonexistent/plans');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 本人確認
  // -----------------------------------------------------------------------

  it('POST /v1/identity/verify — body バリデーション', async () => {
    const bad = await request(app.getHttpServer())
      .post('/v1/identity/verify')
      .send({ userId: '' });
    expect(bad.status).toBe(400);
  });

  it('POST /v1/identity/verify — 正常系（ID が返る）', async () => {
    const ok = await request(app.getHttpServer())
      .post('/v1/identity/verify')
      .send({ userId: 'user-001', venueId: 'venue-001' });
    expect(ok.status).toBe(201);
    expect(ok.body.identityVerificationId).toBeDefined();
    expect(ok.body.status).toBe('VERIFIED');
  });

  // -----------------------------------------------------------------------
  // 利用権購入 → チェックイン → チェックアウト フロー
  // -----------------------------------------------------------------------

  it('利用権購入→チェックイン→チェックアウト', async () => {
    const server = app.getHttpServer();

    // シードデータから商品を取得
    const venues = await request(server).get('/v1/venues');
    expect(venues.body.length).toBeGreaterThan(0);

    const venueId = venues.body[0].id;
    const products = await request(server).get(`/v1/venues/${venueId}/plans`);
    expect(products.body.length).toBeGreaterThan(0);
    const productId = products.body[0].id;

    // 購入
    const purchase = await request(server)
      .post('/v1/usage-rights/purchase')
      .set('Idempotency-Key', `flow-${Date.now()}`)
      .send({ productId });
    expect(purchase.status).toBe(201);
    const usageRightId = purchase.body.usageRightId;
    expect(usageRightId).toBeDefined();

    // チェックイン
    const checkin = await request(server)
      .post('/v1/sessions/checkin')
      .send({ usageRightId, venueId });
    expect(checkin.status).toBe(201);
    expect(checkin.body.sessionId).toBeDefined();

    // チェックアウト
    const ikey = `checkout-${Date.now()}`;
    const checkout = await request(server)
      .post('/v1/sessions/checkout')
      .set('Idempotency-Key', ikey)
      .send({ sessionId: checkin.body.sessionId });
    expect(checkout.status).toBe(201);
    expect(checkout.body.usedMinutes).toBeGreaterThanOrEqual(0);

    // 同一キーで再チェックアウト → 同一レスポンス（冪等）
    const checkout2 = await request(server)
      .post('/v1/sessions/checkout')
      .set('Idempotency-Key', ikey)
      .send({ sessionId: checkin.body.sessionId });
    expect(checkout2.status).toBe(201);
    expect(checkout2.body).toEqual(checkout.body);

    // 同一キー・異なるセッション → 409
    const conflict = await request(server)
      .post('/v1/sessions/checkout')
      .set('Idempotency-Key', ikey)
      .send({ sessionId: 'other-session' });
    expect(conflict.status).toBe(409);
  });

  // -----------------------------------------------------------------------
  // ユーザー残高
  // -----------------------------------------------------------------------

  it('GET /v1/user/balance', async () => {
    const res = await request(app.getHttpServer()).get('/v1/user/balance');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('JPYC');
  });

  // -----------------------------------------------------------------------
  // マーチャント管理
  // -----------------------------------------------------------------------

  it('merchant: 店舗作成 → 商品登録', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service');
    // マーチャントを先に作成
    const merchant = await app
      .get(PrismaService)
      .merchant.create({ data: { name: 'テスト運営' } });

    const venue = await request(app.getHttpServer())
      .post('/v1/merchant/venues')
      .send({ merchantId: merchant.id, name: 'テスト新店舗', address: '大阪市' });
    expect(venue.status).toBe(201);
    expect(venue.body.venueId).toBeDefined();

    const product = await request(app.getHttpServer())
      .put(`/v1/merchant/venues/${venue.body.venueId}/products`)
      .send({ productName: '1時間パック', usageType: 'PACK', durationMinutes: 60, priceJpyc: '500' });
    expect(product.status).toBe(200);
    expect(product.body.productId).toBeDefined();
  });

  it('merchant: dispute 作成', async () => {
    const dispute = await request(app.getHttpServer())
      .post('/v1/merchant/disputes')
      .send({ referenceType: 'SESSION', referenceId: 'sess-001' });
    expect(dispute.status).toBe(201);
    expect(dispute.body.disputeId).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 算力市場（無効時）
  // -----------------------------------------------------------------------

  it('compute endpoints: フラグに応じて 200 or 501', async () => {
    const nodes = await request(app.getHttpServer()).get('/v1/compute/nodes');
    // ENABLE_COMPUTE_MARKET フラグに応じて 200/501 が変わる
    expect([200, 501]).toContain(nodes.status);
  });

  // -----------------------------------------------------------------------
  // 譲渡市場（無効時）
  // -----------------------------------------------------------------------

  it('transfer endpoint returns 501 when disabled', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/usage-rights/some-id/transfer')
      .set('Idempotency-Key', 'transfer01')
      .send({ newOwnerUserId: 'user-002' });
    expect(res.status).toBe(501);
  });
});
