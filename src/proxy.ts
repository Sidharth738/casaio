import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const redirectTarget = `${pathname}${request.nextUrl.search}`;

  // Proxy only performs an optimistic signed-in check. Route handlers verify
  // Firebase session cookies and roles before reading or mutating data.
  const hasSession = Boolean(request.cookies.get('casaio_session')?.value);

  // 1. Admin Protected Routes: /admin/*
  if (pathname.startsWith('/admin')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', redirectTarget);
      return NextResponse.redirect(loginUrl);
    }

  }

  // 2. Seller Protected Routes: /seller/* (excluding registration /seller/register)
  if (pathname.startsWith('/seller') && !pathname.startsWith('/seller/register')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', redirectTarget);
      return NextResponse.redirect(loginUrl);
    }

  }

  // 3. Customer Account Routes: /account/*
  if (pathname.startsWith('/account')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', redirectTarget);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/seller/:path*', '/account/:path*'],
};
