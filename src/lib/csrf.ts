import { randomBytes, timingSafeEqual } from 'crypto';

// Double-submit cookie CSRF. The token is issued in a cookie readable by
// client JS (sameSite=strict, so a cross-site request can't read it) and
// must be mirrored by the client as the `x-csrf-token` header on any
// state-changing request. The proxy middleware enforces this for the
// endpoints that matter (admin mutations, item/box writes, uploads).

export const CSRF_COOKIE_NAME = 'moldavite_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const TOKEN_BYTES = 32;

export function issueCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function csrfCookieOptions(isProd: boolean) {
  return {
    httpOnly: false,   // must be readable by client JS
    secure: isProd,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 24 * 60 * 60,
  };
}

export function verifyCsrf(headerValue: string | null | undefined, cookieValue: string | null | undefined): boolean {
  if (!headerValue || !cookieValue) return false;
  if (headerValue.length !== cookieValue.length) return false;
  try {
    return timingSafeEqual(Buffer.from(headerValue), Buffer.from(cookieValue));
  } catch {
    return false;
  }
}
