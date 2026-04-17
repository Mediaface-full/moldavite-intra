import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron', '/verify'];
const ADMIN_PATHS = ['/admin', '/api/admin', '/export', '/api/export'];

// Paths that are reachable on the public "verify.*" subdomain.
// Everything else on that host is redirected to the admin host.
const VERIFY_HOST_ALLOWED_PREFIXES = ['/verify/', '/images/', '/_next/'];

function isVerifyHost(host: string): boolean {
  return host.toLowerCase().startsWith('verify.');
}

function isAllowedOnVerifyHost(pathname: string): boolean {
  if (pathname === '/favicon.ico') return true;
  return VERIFY_HOST_ALLOWED_PREFIXES.some(p => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // ----- Verify subdomain guard -----
  // The public verify subdomain only exposes the certificate landing page
  // and the static assets it needs. All other paths redirect to the admin host.
  if (isVerifyHost(host)) {
    if (!isAllowedOnVerifyHost(pathname)) {
      const appHost = process.env.APP_PUBLIC_HOST || host.replace(/^verify\./i, 'app.');
      const redirectUrl = new URL(`https://${appHost}${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl, 307);
    }
    // Allowed public paths on verify host — no auth required.
    return NextResponse.next();
  }

  // ----- Admin host: regular auth flow -----

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and images
  if (pathname.startsWith('/_next') || pathname.startsWith('/images') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Check auth
  const token = request.cookies.get('moldavite_session')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const user = verifyToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set('moldavite_session', '', { maxAge: 0, path: '/' });
    return response;
  }

  // Admin-only paths
  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && user.role !== 'ADMIN') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
