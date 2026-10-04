/**
 * Autentizace Shop API v1 (e-shop BM SHOP → intra). Kontrakt: app/docs/SHOP-API.md.
 *
 * Machine-to-machine: NE cookie session, NE CSRF (proxy.ts pouští jen přesný prefix /api/shop/v1/).
 * Všechny vrstvy jsou fail-closed:
 *   1. SHOP_API_TOKEN nenastaven / kratší než 32 znaků → 503 (API vypnuté, nic se nevydá)
 *   2. IP mimo SHOP_API_ALLOWED_IPS (čárkou) → 403; prázdný allowlist = nikdo
 *   3. rate limit 120 / min / IP → 429
 *   4. Bearer token porovnaný timing-safe → 401
 * Pořadí 2 → 3 → 4: cizí IP se nedostane ani k porovnání tokenu.
 */
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const SHOP_API_RATE_LIMIT = 120;
export const SHOP_API_RATE_WINDOW_MS = 60_000;
const MIN_TOKEN_LENGTH = 32;

export type ShopAuthEnv = {
  token: string | undefined;
  allowedIps: string | undefined;
};

export type ShopAuthResult =
  | { ok: true; ip: string }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

function envFromProcess(): ShopAuthEnv {
  return { token: process.env.SHOP_API_TOKEN, allowedIps: process.env.SHOP_API_ALLOWED_IPS };
}

export function parseAllowedIps(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export function tokenMatches(expected: string, header: string | null): boolean {
  if (!header) return false;
  const m = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Čistá kontrola (testovatelná bez Next runtime). */
export function checkShopAuth(request: Request, env: ShopAuthEnv = envFromProcess()): ShopAuthResult {
  const token = env.token ?? '';
  if (token.length < MIN_TOKEN_LENGTH) {
    return { ok: false, status: 503, error: 'not_configured' };
  }

  const ip = getClientIp(request);
  if (!parseAllowedIps(env.allowedIps).has(ip)) {
    return { ok: false, status: 403, error: 'forbidden_ip' };
  }

  const rl = checkRateLimit(`shop-api:${ip}`, SHOP_API_RATE_LIMIT, SHOP_API_RATE_WINDOW_MS);
  if (!rl.ok) {
    return { ok: false, status: 429, error: 'rate_limited', retryAfterSec: rl.retryAfterSec };
  }

  if (!tokenMatches(token, request.headers.get('authorization'))) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  return { ok: true, ip };
}

/** JSON odpověď Shop API — vždy bez cache. */
export function shopJson(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function shopError(status: number, error: string, message = '', retryAfterSec?: number): NextResponse {
  const headers: Record<string, string> = {};
  if (retryAfterSec) headers['Retry-After'] = String(retryAfterSec);
  return shopJson({ error, message }, status, headers);
}

/**
 * Použití v route handleru:
 *   const auth = authorizeShop(request); if (auth instanceof NextResponse) return auth;
 */
export function authorizeShop(request: Request): { ip: string } | NextResponse {
  const result = checkShopAuth(request);
  if (!result.ok) {
    if (result.status === 403 || result.status === 401) {
      // Bez hodnot tokenu — jen IP a důvod (pro diagnostiku útoků v docker logs).
      console.warn(`[shop-api] ${result.error} ip=${getClientIp(request)} path=${new URL(request.url).pathname}`);
    }
    return shopError(result.status, result.error, '', result.retryAfterSec);
  }
  return { ip: result.ip };
}
