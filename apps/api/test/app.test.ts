import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { createTestToken, authHeader } from './helpers/auth.helper';

describe('API', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    token = createTestToken();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /v1/usage-rights/purchase requires Idempotency-Key', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .send({ productId: 'p1' });
    expect(res.status).toBe(400);
  });

  it('POST /v1/usage-rights/purchase validates body and idempotency key format', async () => {
    const server = app.getHttpServer();

    const invalidBody = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'abcDEF12')
      .send({ productId: '' });
    expect(invalidBody.status).toBe(400);

    const invalidKey = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'ab')
      .send({ productId: 'p1' });
    expect(invalidKey.status).toBe(400);
  });

  it('POST /v1/usage-rights/purchase は冪等性を保証する（存在しない productId → 404）', async () => {
    const server = app.getHttpServer();

    const r1 = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'abcDEF12')
      .send({ productId: 'nonexistent-product-id' });
    expect(r1.status).toBe(404);
  });

  it('POST /v1/usage-rights/purchase 冪等性：同一キーで同一レスポンスを返す', async () => {
    const server = app.getHttpServer();

    const venues = await request(server).get('/v1/venues');
    if (venues.body.length === 0) return;

    const venueId = venues.body[0].id;
    const products = await request(server).get(`/v1/venues/${venueId}/plans`);
    if (!products.body[0]) return;

    const productId = products.body[0].id;
    const body = { productId };

    const r1 = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'idemp-test-001')
      .send(body);
    expect(r1.status).toBe(201);
    expect(r1.body.usageRightId).toBeDefined();

    const r2 = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'idemp-test-001')
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.usageRightId).toBe(r1.body.usageRightId);

    const r3 = await request(server)
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', 'idemp-test-001')
      .send({ productId: 'other-product' });
    expect(r3.status).toBe(409);
  });
});
