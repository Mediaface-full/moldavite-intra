/**
 * GET /api/etsy/oauth/callback?code&state — návrat z Etsy. Bez session cookie (SameSite=Strict, viz proxy.ts);
 * ověří podepsanou cookie `etsy_oauth`, shodu `state` a že uživatel z cookie je pořád ADMIN.
 * Pak vymění kód za tokeny, načte obchod a uloží šifrované připojení.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { getClientIp } from '@/lib/rateLimit';
import { EtsyClient } from '@/lib/etsy/client';
import { etsyConfigured } from '@/lib/etsy/config';
import { exchangeCode, OAUTH_COOKIE, readOauthCookie, saveConnection } from '@/lib/etsy/connection';

export const runtime = 'nodejs';

function back(request: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/admin/etsy?${query}`, process.env.NEXT_PUBLIC_BASE_URL || request.url), 302);
  res.cookies.set(OAUTH_COOKIE, '', { maxAge: 0, path: '/api/etsy/oauth' });
  return res;
}

export async function GET(request: NextRequest) {
  if (!etsyConfigured()) return NextResponse.json({ error: 'Etsy není nastavené' }, { status: 503 });
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const saved = readOauthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!code || !state || !saved || saved.state !== state) {
    return NextResponse.json({ error: 'Neplatný nebo prošlý návrat z Etsy — spusť připojení znovu v Administraci → Etsy' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: saved.userId }, select: { id: true, role: true } });
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const tokens = await exchangeCode(code, saved.verifier);
    const client = new EtsyClient({ accessToken: tokens.access_token });
    const me = await client.getMe();
    const shop = await client.getShop(me.shop_id);
    await saveConnection(tokens, { shopId: BigInt(shop.shop_id), shopName: shop.shop_name, currencyCode: shop.currency_code, etsyUserId: BigInt(me.user_id) });
    await logActivity(user.id, 'etsy.connect', shop.shop_name, `Obchod ${shop.shop_name} (${shop.currency_code}) připojen`, getClientIp(request));
    return back(request, 'connected=1');
  } catch (err) {
    console.error('[etsy] připojení selhalo', err instanceof Error ? err.message : err);
    return back(request, 'error=connect');
  }
}
