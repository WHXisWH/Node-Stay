import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 保護対象のルートプレフィックス
 * これらのルートは認証済み Cookie が必要
 */
const PROTECTED_PREFIXES = [
  '/usage-rights',
  '/sessions',
  '/revenue',
  '/merchant',
  '/passes',
];

/**
 * Next.js ミドルウェア
 * 保護ルートへのアクセス時に認証 Cookie を確認し、未認証の場合はトップページへリダイレクト
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const authed = request.cookies.get('nodestay-authed')?.value;
  if (authed === '1') return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/';
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/usage-rights/:path*',
    '/sessions/:path*',
    '/revenue/:path*',
    '/merchant/:path*',
    '/passes/:path*',
  ],
};
