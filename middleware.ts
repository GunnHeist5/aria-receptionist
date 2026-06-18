import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin auth ──────────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    const session  = request.cookies.get('admin_session')?.value;
    const password = process.env.ADMIN_PASSWORD;
    if (!password || session !== password) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // ── Leads (contractor) auth ──────────────────────────────────────────────────
  if (pathname.startsWith('/leads')) {
    const token = process.env.LEADS_TOKEN;
    if (!token) return NextResponse.next();
    if (request.cookies.get('leads_session')?.value === token) return NextResponse.next();
    const urlToken = request.nextUrl.searchParams.get('token');
    if (urlToken === token) {
      const clean = new URL(request.nextUrl.href);
      clean.searchParams.delete('token');
      const res = NextResponse.redirect(clean);
      res.cookies.set('leads_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' });
      return res;
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ── Intake token auth ────────────────────────────────────────────────────────
  if (pathname.startsWith('/intake')) {
    const token = process.env.INTAKE_TOKEN;
    if (!token) return NextResponse.next(); // unconfigured = open (local dev)

    // Valid cookie → let through
    if (request.cookies.get('intake_session')?.value === token) {
      return NextResponse.next();
    }

    // Valid URL token → set cookie and redirect to clean URL
    const urlToken = request.nextUrl.searchParams.get('token');
    if (urlToken === token) {
      const clean = new URL(request.nextUrl.href);
      clean.searchParams.delete('token');
      const res = NextResponse.redirect(clean);
      res.cookies.set('intake_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return res;
    }

    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/leads', '/leads/:path*', '/intake', '/intake/:path*'],
};
