import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { CSRF_COOKIE_NAME, CSRF_HEADER, verifyCsrf } from '@/lib/csrf';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron', '/verify'];
const ADMIN_PATHS = ['/admin', '/api/admin', '/export', '/api/export'];

// API endpoints where we enforce CSRF on state-changing methods. The cron
// endpoint and /api/auth/login are out of scope (secret-auth or login).
const CSRF_ENFORCED_PREFIXES = ['/api/admin/', '/api/items', '/api/boxes', '/api/ai/', '/api/scan', '/api/rates'];
const CSRF_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function requiresCsrf(pathname: string, method: string): boolean {
  if (!CSRF_METHODS.has(method)) return false;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') return false;
  return CSRF_ENFORCED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

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

// Per-request nonce enables a strict CSP without 'unsafe-inline'/'unsafe-eval'.
// Next.js auto-applies x-nonce to its framework scripts and inline hydration.
function buildCsp(nonce: string, isDev: boolean): string {
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Next.js inlines small style hydration; keep 'unsafe-inline' for styles
    // (low risk — CSS can't execute), drop for scripts which is the real win.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

function applySecurityHeaders(response: NextResponse, nonce: string, isProd: boolean) {
  const csp = buildCsp(nonce, !isProd);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isProd) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const isProd = process.env.NODE_ENV === 'production';

  // Nonce for each request. Next.js picks it up from the CSP header and
  // auto-nonces framework scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-nonce', nonce);

  // ----- Verify subdomain guard -----
  if (isVerifyHost(host)) {
    if (!isAllowedOnVerifyHost(pathname)) {
      const appHost = process.env.APP_PUBLIC_HOST || host.replace(/^verify\./i, 'app.');
      const redirectUrl = new URL(`https://${appHost}${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl, 307);
    }
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // ----- Admin host: regular auth flow -----

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // Allow static files and images.
  // public/ assets (logo*.svg, favicon, og images, etc.) musí být dostupné
  // i na login page (před autentizací), jinak je proxy odřízne 307→/login
  // a obrázky se rozbijí. Bezpečné: pouští se jen statické přípony.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    /\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map|txt)$/i.test(pathname)
  ) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
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

  // CSRF guard for mutation requests to enforced API paths.
  // Skip when a valid cron-secret header is present — scheduled tasks carry
  // their own out-of-band auth and don't have a browser cookie jar.
  const hasCronSecret = !!request.headers.get('x-cron-secret');
  if (!hasCronSecret && requiresCsrf(pathname, request.method)) {
    const headerToken = request.headers.get(CSRF_HEADER);
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (!verifyCsrf(headerToken, cookieToken)) {
      return NextResponse.json(
        { error: 'CSRF token missing or invalid. Reload the page and try again.' },
        { status: 403 }
      );
    }
  }

  const res = NextResponse.next({ request: { headers: forwardedHeaders } });
  applySecurityHeaders(res, nonce, isProd);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
