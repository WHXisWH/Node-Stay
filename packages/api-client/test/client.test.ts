import { describe, expect, it } from 'vitest';
import { NodeStayClient } from '../src/index';

describe('NodeStayClient', () => {
  it('sets Idempotency-Key header on purchaseUsageRight', async () => {
    const seen: any[] = [];
    const client = new NodeStayClient({
      baseUrl: 'http://example.test///',
      fetchImpl: async (url: any, init?: any) => {
        seen.push({ url, init });
        return new Response(JSON.stringify({ usageRightId: 'ur_1' }), { status: 200 });
      },
    });

    const out = await client.purchaseUsageRight({ productId: 'prod_1' }, 'abcDEF12');
    expect(out.usageRightId).toBe('ur_1');
    expect(seen[0].url).toBe('http://example.test/v1/usage-rights/purchase');
    expect(seen[0].init.headers['idempotency-key']).toBe('abcDEF12');
  });

  it('health returns ok on 200', async () => {
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    await expect(client.health()).resolves.toEqual({ ok: true });
  });

  it('throws on non-ok response', async () => {
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async () => new Response('no', { status: 500 }),
    });
    await expect(client.health()).rejects.toThrow('APIエラー: 500');
  });

  it('rejects invalid idempotency key before fetch', async () => {
    let called = false;
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify({ usageRightId: 'ur_1' }), { status: 200 });
      },
    });
    await expect(client.purchaseUsageRight({ productId: 'prod_1' }, '短い')).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('uses global fetch when fetchImpl is omitted', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as any;
    try {
      const client = new NodeStayClient({ baseUrl: 'http://example.test' });
      await expect(client.health()).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws on purchaseUsageRight non-ok response', async () => {
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async () => new Response('no', { status: 400 }),
    });
    await expect(client.purchaseUsageRight({ productId: 'prod_1' }, 'abcDEF12')).rejects.toThrow(
      'APIエラー: 400',
    );
  });

  it('lists venues and plans', async () => {
    const calls: any[] = [];
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async (url: any, init?: any) => {
        calls.push({ url, init });
        if (String(url).endsWith('/v1/venues')) {
          return new Response(JSON.stringify([{ id: 'v1', name: 'n', address: 'a', timezone: 'Asia/Tokyo' }]), {
            status: 200,
          });
        }
        if (String(url).endsWith('/v1/venues/v1/plans')) {
          return new Response(JSON.stringify([{ id: 'prod_1', productName: 'p', durationMinutes: 60, priceJpyc: '500' }]), { status: 200 });
        }
        return new Response('no', { status: 404 });
      },
    });

    const venues = await client.listVenues();
    expect(venues[0].venueId).toBe('v1');
    const plans = await client.listUsageProducts('v1');
    expect(plans[0].productId).toBe('prod_1');
    expect(calls.length).toBe(2);
  });

  it('calls identity/session/balance/merchant endpoints', async () => {
    const calls: any[] = [];
    const client = new NodeStayClient({
      baseUrl: 'http://example.test',
      fetchImpl: async (url: any, init?: any) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/v1/identity/verify')) {
          return new Response(JSON.stringify({ identityVerificationId: 'iv1' }), { status: 200 });
        }
        if (String(url).endsWith('/v1/sessions/checkin')) {
          return new Response(JSON.stringify({ sessionId: 's1' }), { status: 200 });
        }
        if (String(url).endsWith('/v1/sessions/checkout')) {
          return new Response(JSON.stringify({ usedMinutes: 0 }), { status: 200 });
        }
        if (String(url).endsWith('/v1/user/balance')) {
          return new Response(JSON.stringify({ currency: 'JPYC', balanceMinor: 0, depositHeldMinor: 0 }), { status: 200 });
        }
        if (String(url).endsWith('/v1/merchant/venues')) {
          return new Response(JSON.stringify({ venueId: 'v1', name: 'n', address: 'a', timezone: 'Asia/Tokyo' }), { status: 200 });
        }
        return new Response('no', { status: 404 });
      },
    });

    await expect(client.verifyIdentity({ userId: 'u1', venueId: 'v1' })).resolves.toEqual({ identityVerificationId: 'iv1' });
    await expect(client.checkinSession({ usageRightId: 'ur-001', machineId: 'm1', venueId: 'v1', identityVerificationId: 'iv1' })).resolves.toEqual({
      sessionId: 's1',
    });
    await expect(client.checkoutSession({ sessionId: 's1' }, 'abcDEF12')).resolves.toEqual({ usedMinutes: 0 });
    await expect(client.getBalance()).resolves.toEqual({ currency: 'JPYC', balanceMinor: 0, depositHeldMinor: 0 });
    await expect(client.createVenueAsMerchant({ name: 'n', address: 'a', timezone: 'Asia/Tokyo' })).resolves.toEqual({
      venueId: 'v1',
      name: 'n',
      address: 'a',
      timezone: 'Asia/Tokyo',
    });

    const checkoutCall = calls.find((c) => c.url.endsWith('/v1/sessions/checkout'));
    expect(checkoutCall.init.headers['idempotency-key']).toBe('abcDEF12');
  });
});
