import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { verifyToken } from '@/lib/auth';
import { CSRF_COOKIE_NAME, CSRF_HEADER, verifyCsrf } from '@/lib/csrf';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron', '/verify'];
// Proxy gating pro plně admin prefixy. Pricing-config / attr-options / sellers
// mají mix GET (pro non-admin UI) + mutate (admin) — gating řeší vnitřní handler
// per metoda. ADMIN_PATHS držet jen pro 100% admin prefixy.
const ADMIN_PATHS = ['/admin', '/api/admin', '/export', '/api/export'];

// Shop API v1 (e-shop BM SHOP → intra, server–server; app/docs/SHOP-API.md). Vlastní autentizace
// v lib/shop/auth.ts (Bearer SHOP_API_TOKEN + allowlist IP + rate limit), proto bez cookie a CSRF.
// Přesný prefix S LOMÍTKEM — /api/shop/v1x, /api/shop/v2/, /api/shop nesmí projít (viz PUBLIC_PATHS:
// startsWith bez lomítka otevírá i sousední cesty). Testy: __tests__/proxy-matcher.test.ts.
// Schváleno Gideonem 4. 10. 2026.
const SHOP_API_PREFIX = '/api/shop/v1/';

// Noční záloha z DSM cronu: POST /api/admin/backup jen s platným x-cron-secret (bez cookie).
// Bez této výjimky proxy vracela 401 ještě před handlerem (authorise() v route) → zálohy neběžely
// (zjištěno 4. 10. 2026, Gideon potvrdil: v backups/scheduled/ žádné soubory). Jen tato přesná
// cesta + metoda + platný secret; handler secret ověřuje znovu.
const CRON_BACKUP_PATH = '/api/admin/backup';

// CSRF: default-deny (audit 10. 9. 2026). Dřív allow-list prefixů — každý
// nový API prefix (naposledy /api/library/) se do ní musel ručně přidat a
// zapomnělo se na to. Teď KAŽDÁ mutace pod /api/ vyžaduje double-submit
// token; jediná výjimka je login (token ještě neexistuje). Logout ho má taky
// (LogoutButton jde přes apiFetch). Cron callers mají x-cron-secret.
const CSRF_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login']);

function requiresCsrf(pathname: string, method: string): boolean {
  if (!CSRF_METHODS.has(method)) return false;
  if (CSRF_EXEMPT_PATHS.has(pathname)) return false;
  return pathname.startsWith('/api/');
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

/**
 * Constant-time comparison cron-secret hlavičky vs `CRON_SECRET` env.
 * Vrací true jen pokud env je definovaný, header je přítomen a hodnoty se
 * přesně shodují. Bez env (nebo neshody) vrátí false — žádný bypass CSRF.
 */
function hasValidCronSecret(request: NextRequest): boolean {
  const headerValue = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  if (!headerValue || !expected) return false;
  try {
    const a = Buffer.from(headerValue);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
  // `0` = vypnout legacy XSS auditor. Hodnota `1; mode=block` je deprecated a
  // ve starých prohlížečích sama umožňovala info-leak/side-channel; ochranu
  // proti XSS dává CSP s nonce výše. (OWASP doporučení.)
  response.headers.set('X-XSS-Protection', '0');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // microphone=self — povoluje hlasovy vstup na nasem origin (VoiceInputButton
  // pres Web Speech API + getUserMedia). Kdybychom poslali microphone=() jak
  // bylo drive, browser zamitne mic pro VSE bez ohledu na user permission.
  // camera/geolocation/payment zustavaji prazne — nepotrebujeme je.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
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

  // Shop API v1 — autentizace až v route handleru (lib/shop/auth.ts), viz SHOP_API_PREFIX.
  if (pathname.startsWith(SHOP_API_PREFIX)) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // Noční záloha s platným cron secretem (handler authorise() ho ověří znovu), viz CRON_BACKUP_PATH.
  if (pathname === CRON_BACKUP_PATH && request.method === 'POST' && hasValidCronSecret(request)) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // Allow static files and images.
  // public/ assets (logo*.svg, favicon, og images, etc.) musí být dostupné
  // i na login page (před autentizací), jinak je proxy odřízne 307→/login
  // a obrázky se rozbijí.
  //
  // SECURITY (audit 10. 9. 2026): výjimka na příponu dřív platila pro JAKOUKOLI
  // cestu. `/items/1.svg` → Next dá dynamic segmentu id="1.svg" → stránka
  // udělala parseInt → 1 → detail kamene s nákupní cenou BEZ přihlášení
  // (ověřeno na produkci; stejně /boxes/N.svg). Teď se pouští jen /_next,
  // /images, /favicon.ico a soubory v KOŘENI (`/logo.svg`) — public/ nemá
  // podadresáře a všechny dynamic routes mají ≥ 2 segmenty. Stránky mají navíc
  // vlastní guard (lib/pageAuth.ts), proxy není jediná vrstva.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    /^\/[^/]+\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map|txt|xml|json|webmanifest)$/i.test(pathname)
  ) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    applySecurityHeaders(res, nonce, isProd);
    return res;
  }

  // Všechny odpovědi vytvořené přímo v proxy (401/403/307) dostanou stejné
  // security hlavičky jako normální stránky (audit 10. 9. 2026 — dřív bez).
  const withHeaders = (res: NextResponse) => { applySecurityHeaders(res, nonce, isProd); return res; };

  // Check auth
  const token = request.cookies.get('moldavite_session')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return withHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
    return withHeaders(NextResponse.redirect(new URL('/login', request.url)));
  }

  const user = verifyToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return withHeaders(NextResponse.json({ error: 'Invalid session' }, { status: 401 }));
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set('moldavite_session', '', { maxAge: 0, path: '/' });
    return withHeaders(response);
  }

  // Admin-only paths
  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && user.role !== 'ADMIN') {
    if (pathname.startsWith('/api/')) {
      return withHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    }
    return withHeaders(NextResponse.redirect(new URL('/', request.url)));
  }

  // CSRF guard for mutation requests to enforced API paths.
  // Skip when a valid cron-secret header is present — scheduled tasks carry
  // their own out-of-band auth and don't have a browser cookie jar.
  // SECURITY: must do constant-time compare against env, not just truthy check
  // (audit 19. 6. 2026 — truthy umožňoval bypass CSRF s libovolnou hodnotou).
  const hasCronSecret = hasValidCronSecret(request);
  if (!hasCronSecret && requiresCsrf(pathname, request.method)) {
    const headerToken = request.headers.get(CSRF_HEADER);
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (!verifyCsrf(headerToken, cookieToken)) {
      return withHeaders(NextResponse.json(
        { error: 'CSRF token missing or invalid. Reload the page and try again.' },
        { status: 403 }
      ));
    }
  }

  const res = NextResponse.next({ request: { headers: forwardedHeaders } });
  applySecurityHeaders(res, nonce, isProd);
  return res;
}

// SECURITY (audit 10. 9. 2026): matcher NESMÍ mít `missing` výjimku pro
// prefetch hlavičky (`next-router-prefetch`, `purpose: prefetch`), jak ji má
// příklad v Next docs pro CSP. Ta výjimka znamená, že request s takovou
// hlavičkou proxy ÚPLNĚ přeskočí — tedy žádný auth check, žádný redirect na
// /login. Ověřeno na produkci: `curl -H "purpose: prefetch" /items` vrátil
// celý HTML se seznamem kamenů bez přihlášení. Nonce na prefetch odpovědi je
// neškodný (RSC payload nemá inline skripty), auth check je nutný.
// Regresní test: src/__tests__/proxy-matcher.test.ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
