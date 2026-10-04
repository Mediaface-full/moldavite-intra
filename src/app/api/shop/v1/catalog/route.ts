/**
 * GET /api/shop/v1/catalog — plný katalog pro e-shop BM SHOP. Kontrakt: app/docs/SHOP-API.md.
 * Auth: lib/shop/auth.ts (Bearer + IP allowlist + rate limit). Proxy pouští /api/shop/v1/ bez cookie.
 */
import { NextResponse } from 'next/server';
import { authorizeShop, shopError, shopJson } from '@/lib/shop/auth';
import { loadCatalog } from '@/lib/shop/catalog';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = authorizeShop(request);
  if (auth instanceof NextResponse) return auth;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return shopError(503, 'not_configured', 'NEXT_PUBLIC_BASE_URL');

  try {
    return shopJson(await loadCatalog(baseUrl.replace(/\/$/, '')));
  } catch (err) {
    console.error('[shop-api] catalog failed', err);
    return shopError(500, 'internal');
  }
}
