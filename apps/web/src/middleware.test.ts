/**
 * middleware: リダイレクト URL に _rsc 等の内部パラメータが混入しないことを確認。
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

// next/server の NextResponse.redirect をスパイ
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      redirect: vi.fn((url: URL | string) => ({
        type: 'redirect',
        url: url.toString(),
      })),
      next: vi.fn(() => ({ type: 'next' })),
    },
  };
});

function makeRequest(path: string, queryString = ''): NextRequest {
  const url = `http://localhost:3000${path}${queryString ? `?${queryString}` : ''}`;
  return new NextRequest(url);
}

describe('middleware', () => {
  it('保護対象ルートへ未認証アクセス: redirect URL に _rsc が含まれない', () => {
    const req = makeRequest('/passes', '_rsc=Fabcdef&someOther=1');
    const res = middleware(req) as { url: string };
    expect(res.url).toContain('redirect=%2Fpasses');
    expect(res.url).not.toContain('_rsc');
    expect(res.url).not.toContain('someOther');
  });

  it('保護対象ルートへ未認証アクセス: redirect パラメータにパスが正しく設定される', () => {
    const req = makeRequest('/sessions/123');
    const res = middleware(req) as { url: string };
    expect(res.url).toContain('redirect=%2Fsessions%2F123');
  });

  it('保護対象ルートへ未認証アクセス: ルートドメインへリダイレクト（パス = /）', () => {
    const req = makeRequest('/passes');
    const res = middleware(req) as { url: string };
    const redirectUrl = new URL(res.url);
    expect(redirectUrl.pathname).toBe('/');
  });

  it('認証済み Cookie がある場合はリダイレクトしない', () => {
    const req = makeRequest('/passes');
    req.cookies.set('nodestay-authed', '1');
    const res = middleware(req) as { type: string };
    expect(res.type).toBe('next');
  });

  it('非保護ルートはスルー', () => {
    const req = makeRequest('/venues');
    const res = middleware(req) as { type: string };
    expect(res.type).toBe('next');
  });

  it('/merchant/register はスルー（認証不要）', () => {
    const req = makeRequest('/merchant/register');
    const res = middleware(req) as { type: string };
    expect(res.type).toBe('next');
  });
});
