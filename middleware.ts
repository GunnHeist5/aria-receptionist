import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();
  if (request.nextUrl.pathname === '/admin/login') return NextResponse.next();

  const session = request.cookies.get('admin_session')?.value;
  const password = process.env.ADMIN_PASSWORD;

  if (!password || session !== password) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
