import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import {
  createTestToken,
  createExpiredToken,
  getTestWallet,
  authHeader,
} from './helpers/auth.helper';

describe('Auth Guard & Security', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    token = createTestToken();
  }, 60000);

  afterAll(async () => {
    await app.close();
  }, 60000);

  // -----------------------------------------------------------------------
  // Public routes: no auth required
  // -----------------------------------------------------------------------

  describe('Public routes (no auth required)', () => {
    it('GET /v1/health → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.timestamp).toBe('string');
      expect(res.body.services?.api?.status).toBe('ok');
      expect(res.body.services?.database?.status).toBeDefined();
      expect(res.body.services?.blockchain?.status).toBe('ok');
    });

    it('GET /v1/venues → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/venues');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /v1/venues/:id/plans → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/venues/nonexistent/plans');
      expect(res.status).toBe(200);
    });

    it('GET /v1/auth/nonce → 200 without token (valid address)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/auth/nonce?address=${getTestWallet()}`);
      expect(res.status).toBe(200);
      expect(res.body.nonce).toBeDefined();
    });

    it('POST /v1/auth/verify → no auth required (returns 400 for invalid body)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({});
      expect(res.status).toBe(400);
    });

    it('POST /v1/identity/verify → no auth required', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .send({ userId: 'test', venueId: 'test' });
      expect([201, 400, 500]).toContain(res.status);
    });

    it('GET /v1/marketplace/listings → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/marketplace/listings');
      expect(res.status).toBe(200);
    });

    it('GET /v1/machines → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/machines');
      expect(res.status).toBe(200);
    });

    it('GET /v1/revenue/programs → 200 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/revenue/programs');
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Protected routes: require valid JWT
  // -----------------------------------------------------------------------

  describe('Protected routes (auth required)', () => {
    const protectedEndpoints = [
      { method: 'get' as const, path: '/v1/user/balance' },
      { method: 'get' as const, path: '/v1/usage-rights' },
      { method: 'post' as const, path: '/v1/usage-rights/purchase' },
      { method: 'post' as const, path: '/v1/sessions/checkin' },
      { method: 'get' as const, path: '/v1/sessions' },
      { method: 'post' as const, path: '/v1/sessions/checkout' },
      { method: 'post' as const, path: '/v1/marketplace/listings' },
      { method: 'post' as const, path: '/v1/revenue/programs' },
      { method: 'post' as const, path: '/v1/revenue/claim' },
      { method: 'get' as const, path: '/v1/revenue/my-rights' },
      { method: 'get' as const, path: '/v1/revenue/claims' },
      { method: 'post' as const, path: '/v1/machines' },
    ];

    it.each(protectedEndpoints)(
      '$method $path → 401 without token',
      async ({ method, path }) => {
        const res = await request(app.getHttpServer())[method](path).send({});
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('認証が必要です');
      },
    );

    it.each(protectedEndpoints)(
      '$method $path → 401 with invalid token',
      async ({ method, path }) => {
        const res = await request(app.getHttpServer())[method](path)
          .set('Authorization', 'Bearer invalid-token')
          .send({});
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('トークンが無効です');
      },
    );

    it.each(protectedEndpoints)(
      '$method $path → 401 with expired token',
      async ({ method, path }) => {
        const expired = createExpiredToken();
        // small delay to ensure expiry
        await new Promise((r) => setTimeout(r, 1100));
        const res = await request(app.getHttpServer())[method](path)
          .set('Authorization', `Bearer ${expired}`)
          .send({});
        expect(res.status).toBe(401);
      },
    );
  });

  // -----------------------------------------------------------------------
  // Auth header format
  // -----------------------------------------------------------------------

  describe('Auth header format', () => {
    it('rejects non-Bearer scheme', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/user/balance')
        .set('Authorization', `Basic ${token}`);
      expect(res.status).toBe(401);
    });

    it('rejects empty Bearer value', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/user/balance')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('accepts valid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/user/balance')
        .set(...authHeader(token));
      // should not be 401; actual status depends on downstream logic
      expect(res.status).not.toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // JWT payload: address is set on request
  // -----------------------------------------------------------------------

  describe('JWT payload extraction', () => {
    it('GET /v1/user/balance uses JWT address (auth passes)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/user/balance')
        .set(...authHeader(token));
      // Auth passes; status depends on downstream RPC/chain availability
      expect(res.status).not.toBe(401);
    }, 15000);

    it('GET /v1/usage-rights uses JWT address (not 401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/usage-rights')
        .set(...authHeader(token));
      // 200 if user exists, 404 if wallet has no matching user — both mean auth passed
      expect(res.status).not.toBe(401);
    });

    it('GET /v1/sessions uses JWT address (not 401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/sessions')
        .set(...authHeader(token));
      expect(res.status).not.toBe(401);
    });

    it('GET /v1/revenue/my-rights uses JWT address (not 401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/revenue/my-rights')
        .set(...authHeader(token));
      expect(res.status).not.toBe(401);
    });

    it('GET /v1/revenue/claims uses JWT address (not 401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/revenue/claims')
        .set(...authHeader(token));
      expect(res.status).not.toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // JWT Secret: no hardcoded fallback
  // -----------------------------------------------------------------------

  describe('JWT Secret safety', () => {
    it('AuthService.verifyToken rejects token signed with wrong secret', async () => {
      const { AuthService } = await import('../src/modules/v1/services/auth.service');
      const service = new AuthService();
      const badToken = require('jsonwebtoken').sign(
        { sub: '0x1234', address: '0x1234' },
        'wrong-secret',
        { expiresIn: '1h' },
      );
      expect(() => service.verifyToken(badToken)).toThrow();
    });
  });
});
