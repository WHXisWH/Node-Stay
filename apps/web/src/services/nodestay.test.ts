import { describe, expect, it, vi } from 'vitest';
import { createNodeStayClient } from './nodestay';

describe('createNodeStayClient', () => {
  it('uses default baseUrl and calls health', async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (vi.fn(async (url: any) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown) as typeof fetch;
    try {
      delete (process.env as any).NEXT_PUBLIC_API_BASE_URL;
      const client = createNodeStayClient();
      await expect(client.health()).resolves.toEqual({ ok: true });
      expect(seen[0]).toBe('http://localhost:3001/v1/health');
    } finally {
      globalThis.fetch = original;
    }
  });
});

