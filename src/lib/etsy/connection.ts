/**
 * Připojení obchodu na Etsy: výměna OAuth kódu, uložení šifrovaných tokenů, automatická obnova.
 * Access token platí 1 h → obnova 5 min před vypršením. Refresh 400/401 = trvale neplatný →
 * „Odpojeno“ + upozornění (jednou). Dočasná chyba (5xx, síť) neodpojuje, jen vrátí null.
 *
 * OAuth callback: session cookie intra je SameSite=Strict → při návratu z etsy.com ji prohlížeč
 * nepošle. Callback se proto ověřuje krátkodobou podepsanou cookie `etsy_oauth` (SameSite=Lax),
 * kterou nastavil /api/etsy/oauth/start přihlášenému adminovi (verifier, state, userId, čas).
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { EtsyClient } from './client';
import { etsyApiKeyHeader, etsyConfigured, etsyRedirectUri, ETSY_TOKEN_URL } from './config';
import { decryptToken, encryptToken } from './crypto';
import { alertEtsy } from './alerts';

export const OAUTH_COOKIE = 'etsy_oauth';
export const OAUTH_COOKIE_TTL_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 5 * 60_000;

export interface StoredConnection {
  shopId: bigint;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: Date;
  disconnectedReason: string | null;
}
export interface ConnectionStore {
  load(): Promise<StoredConnection | null>;
  saveTokens(t: { accessTokenEnc: string; refreshTokenEnc: string; accessExpiresAt: Date }): Promise<void>;
  markDisconnected(reason: string): Promise<void>;
}
interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; scope?: string }

export const prismaStore: ConnectionStore = {
  load: () => prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { shopId: true, accessTokenEnc: true, refreshTokenEnc: true, accessExpiresAt: true, disconnectedReason: true } }),
  saveTokens: async (t) => { await prisma.etsyConnection.update({ where: { id: 1 }, data: t }); },
  markDisconnected: async (reason) => { await prisma.etsyConnection.updateMany({ where: { id: 1 }, data: { disconnectedReason: reason } }); },
};

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<{ status: number; data?: TokenResponse }> {
  let res: Response;
  try {
    res = await fetchImpl(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-api-key': etsyApiKeyHeader() },
      body: new URLSearchParams({ client_id: process.env.ETSY_KEYSTRING ?? '', ...params }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { status: 0 };
  }
  if (!res.ok) return { status: res.status };
  return { status: res.status, data: (await res.json()) as TokenResponse };
}

export async function exchangeCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<TokenResponse> {
  const r = await tokenRequest({ grant_type: 'authorization_code', redirect_uri: etsyRedirectUri(), code, code_verifier: verifier }, fetchImpl);
  if (!r.data) throw new Error(`Etsy odmítla přihlášení (HTTP ${r.status || 'síť'})`);
  return r.data;
}

export async function saveConnection(tokens: TokenResponse, shop: { shopId: bigint; shopName: string; currencyCode: string; etsyUserId: bigint }): Promise<void> {
  const data = {
    ...shop,
    accessTokenEnc: encryptToken(tokens.access_token),
    refreshTokenEnc: encryptToken(tokens.refresh_token),
    accessExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scopes: tokens.scope ?? '',
    connectedAt: new Date(),
    disconnectedReason: null,
  };
  await prisma.etsyConnection.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}

export async function getEtsyClient(deps: { store?: ConnectionStore; fetchImpl?: typeof fetch; alert?: typeof alertEtsy } = {}): Promise<EtsyClient | null> {
  if (!etsyConfigured()) return null;
  const store = deps.store ?? prismaStore;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const conn = await store.load();
  if (!conn || conn.disconnectedReason) return null;

  let accessToken: string;
  if (conn.accessExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    accessToken = decryptToken(conn.accessTokenEnc);
  } else {
    const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptToken(conn.refreshTokenEnc) }, fetchImpl);
    if (!r.data) {
      if (r.status === 400 || r.status === 401) {
        await store.markDisconnected('refresh_failed');
        await (deps.alert ?? alertEtsy)('disconnected', { note: 'obnova přístupu selhala' });
      } else {
        console.error(`[etsy] obnova tokenu dočasně selhala (HTTP ${r.status || 'síť'})`);
      }
      return null;
    }
    accessToken = r.data.access_token;
    await store.saveTokens({
      accessTokenEnc: encryptToken(r.data.access_token),
      refreshTokenEnc: encryptToken(r.data.refresh_token),
      accessExpiresAt: new Date(Date.now() + r.data.expires_in * 1000),
    });
  }
  return new EtsyClient({ accessToken, shopId: conn.shopId, fetchImpl });
}

// ── OAuth cookie (podepsaná, krátkodobá) ─────────────────────────────

function hmac(payload: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET ?? '').update(`etsy-oauth:${payload}`).digest('base64url');
}

export function signOauthCookie(v: { verifier: string; state: string; userId: number }, issuedAt = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...v, iat: issuedAt })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function readOauthCookie(value: string | undefined | null): { verifier: string; state: string; userId: number } | null {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(hmac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof v.iat !== 'number' || Date.now() - v.iat > OAUTH_COOKIE_TTL_MS) return null;
    if (typeof v.verifier !== 'string' || typeof v.state !== 'string' || !Number.isInteger(v.userId)) return null;
    return { verifier: v.verifier, state: v.state, userId: v.userId };
  } catch {
    return null;
  }
}
