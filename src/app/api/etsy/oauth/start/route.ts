/**
 * GET /api/etsy/oauth/start — ADMIN. Začne připojení obchodu na Etsy (OAuth 2 + PKCE):
 * uloží verifier + state do podepsané cookie `etsy_oauth` (Lax, 10 min) a přesměruje na etsy.com.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ETSY_CONNECT_URL, ETSY_SCOPES, etsyConfigured, etsyRedirectUri } from '@/lib/etsy/config';
import { createPkce } from '@/lib/etsy/pkce';
import { OAUTH_COOKIE, OAUTH_COOKIE_TTL_MS, signOauthCookie } from '@/lib/etsy/connection';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!etsyConfigured()) return NextResponse.json({ error: 'Etsy není nastavené (ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_TOKEN_KEY)' }, { status: 503 });

  const { verifier, challenge, state } = createPkce();
  const url = new URL(ETSY_CONNECT_URL);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: process.env.ETSY_KEYSTRING ?? '', redirect_uri: etsyRedirectUri(),
    scope: ETSY_SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set(OAUTH_COOKIE, signOauthCookie({ verifier, state, userId: session.id }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    maxAge: OAUTH_COOKIE_TTL_MS / 1000, path: '/api/etsy/oauth',
  });
  return res;
}
