import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestToken, authHeader } from './helpers/auth.helper';

describe('Machine API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let venueId: string;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    token = createTestToken();

    const venue = await prisma.venue.findFirst();
    if (!venue) throw new Error('シード venue が存在しません');
    venueId = venue.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Machine 登録 (Authenticated)
  // -----------------------------------------------------------------------

  it('POST /v1/machines — 401 without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/machines')
      .send({ venueId, machineClass: 'GPU' });
    expect(res.status).toBe(401);
  });

  it('POST /v1/machines — GPU機器を登録できる', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({
        venueId,
        machineClass: 'GPU',
        gpu: 'RTX 4090',
        ramGb: 64,
        storageGb: 2000,
        localSerial: `SN-${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.machineId).toBeDefined();
    expect(res.body.machineId).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.body.onchainMachineId).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.body.status).toBe('REGISTERED');
  });

  it('POST /v1/machines — body 不正は 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'INVALID_CLASS' });
    expect(res.status).toBe(400);
  });

  it('POST /v1/machines — Idempotency-Key で冪等化できる', async () => {
    const key = `machine-idem-${Date.now()}`;
    const payload = {
      venueId,
      machineClass: 'CPU',
      cpu: 'Ryzen 9 7950X',
      localSerial: `IDEM-${Date.now()}`,
    };

    const first = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .set('Idempotency-Key', key)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .set('Idempotency-Key', key)
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const conflict = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .set('Idempotency-Key', key)
      .send({ ...payload, cpu: 'Xeon' });
    expect(conflict.status).toBe(409);
  });

  // -----------------------------------------------------------------------
  // Machine 一覧・詳細 (Public)
  // -----------------------------------------------------------------------

  it('GET /v1/machines — 一覧取得（venueId フィルタ）', async () => {
    await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'CPU', cpu: 'i9-14900K', localSerial: `CPU-${Date.now()}` });

    const res = await request(app.getHttpServer())
      .get(`/v1/machines?venueId=${venueId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].venueId).toBe(venueId);
  });

  it('GET /v1/machines/:id — 詳細取得', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'STANDARD', localSerial: `STD-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer()).get(`/v1/machines/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('GET /v1/machines/:id — 存在しない ID は 404', async () => {
    const res = await request(app.getHttpServer()).get('/v1/machines/nonexistent-id');
    expect(res.status).toBe(404);
  });

  // -----------------------------------------------------------------------
  // ステータス更新 (Authenticated)
  // -----------------------------------------------------------------------

  it('PATCH /v1/machines/:id/status — 401 without token', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'GPU', localSerial: `GPU-NOAUTH-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/machines/${id}/status`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(401);
  });

  it('PATCH /v1/machines/:id/status — REGISTERED → ACTIVE', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'GPU', localSerial: `GPU-PATCH-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/machines/${id}/status`)
      .set(...authHeader(token))
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.machineId).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('PATCH /v1/machines/:id/status — 不正ステータスは 400', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'GPU', localSerial: `GPU-BAD-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/machines/${id}/status`)
      .set(...authHeader(token))
      .send({ status: 'UNKNOWN' });
    expect(res.status).toBe(400);
  });

  // -----------------------------------------------------------------------
  // MachineSlot（時間スロット）(Public)
  // -----------------------------------------------------------------------

  it('GET /v1/machines/:id/slots — スロット一覧（初期は空）', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'GPU', localSerial: `SLOT-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer())
      .get(`/v1/machines/${id}/slots`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/machines/:id/slots — 日時不正は 400', async () => {
    const reg = await request(app.getHttpServer())
      .post('/v1/machines')
      .set(...authHeader(token))
      .send({ venueId, machineClass: 'GPU', localSerial: `SLOT2-${Date.now()}` });
    const id = reg.body.id;

    const res = await request(app.getHttpServer())
      .get(`/v1/machines/${id}/slots?from=INVALID_DATE`);
    expect(res.status).toBe(400);
  });

  // -----------------------------------------------------------------------
  // 利用権 GET / cancel (Authenticated for writes)
  // -----------------------------------------------------------------------

  it('GET /v1/usage-rights — uses JWT address (not 401)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/usage-rights')
      .set(...authHeader(token));
    // 200 if user exists, 404 if wallet has no matching user — both mean auth passed
    expect(res.status).not.toBe(401);
  });

  it('GET /v1/usage-rights — 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/usage-rights');
    expect(res.status).toBe(401);
  });

  it('GET /v1/usage-rights/:id — 詳細取得', async () => {
    const venue = await prisma.venue.findFirst();
    const product = await prisma.usageProduct.findFirst({ where: { venueId: venue!.id } });
    if (!product) return;

    const purchase = await request(app.getHttpServer())
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', `get-detail-${Date.now()}`)
      .send({ productId: product.id });
    expect(purchase.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/usage-rights/${purchase.body.usageRightId}`)
      .set(...authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(purchase.body.usageRightId);
    expect(res.body.usageProduct).toBeDefined();
  });

  it('GET /v1/usage-rights/:id — 存在しない ID は 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/usage-rights/nonexistent')
      .set(...authHeader(token));
    expect(res.status).toBe(404);
  });

  it('POST /v1/usage-rights/:id/cancel — キャンセルできる', async () => {
    const product = await prisma.usageProduct.findFirst();
    if (!product) return;

    const purchase = await request(app.getHttpServer())
      .post('/v1/usage-rights/purchase')
      .set(...authHeader(token))
      .set('Idempotency-Key', `cancel-${Date.now()}`)
      .send({ productId: product.id });
    expect(purchase.status).toBe(201);

    const cancel = await request(app.getHttpServer())
      .post(`/v1/usage-rights/${purchase.body.usageRightId}/cancel`)
      .set(...authHeader(token));
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('POST /v1/usage-rights/:id/cancel — 401 without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/usage-rights/nonexistent/cancel');
    expect(res.status).toBe(401);
  });
});
