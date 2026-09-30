import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read session cookie
  const sessionCookie = request.cookies.get('casaio_session');
  let session: { uid: string; email: string; role: string } | null = null;

  if (sessionCookie?.value) {
    try {
      session = JSON.parse(sessionCookie.value);
    } catch {
      session = null;
    }
  }

  // 1. Admin Protected Routes: /admin/*
  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (session.role !== 'admin') {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      unauthorizedUrl.searchParams.set('requiredRole', 'admin');
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  // 2. Seller Protected Routes: /seller/* (excluding registration /seller/register)
  if (pathname.startsWith('/seller') && !pathname.startsWith('/seller/register')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (session.role !== 'seller' && session.role !== 'admin') {
      // Prompt customer to register as seller
      const sellerRegisterUrl = new URL('/seller/register', request.url);
      return NextResponse.redirect(sellerRegisterUrl);
    }
  }

  // 3. Customer Account Routes: /account/*
  if (pathname.startsWith('/account')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/seller/:path*', '/account/:path*'],
};
