import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getEtsyClient, resetEtsyConnectionStateForTests, signOauthCookie, readOauthCookie, type ConnectionStore, type StoredConnection } from '@/lib/etsy/connection';
import { encryptToken, decryptToken } from '@/lib/etsy/crypto';

const KEY = 'ab'.repeat(32);
beforeEach(() => {
  resetEtsyConnectionStateForTests();
  Object.assign(process.env, { ETSY_KEYSTRING: 'ks', ETSY_SHARED_SECRET: 'secret', ETSY_TOKEN_KEY: KEY, NEXTAUTH_SECRET: 'x'.repeat(40) });
});

function memStore(conn: StoredConnection | null) {
  const state = { conn, disconnected: [] as string[] };
  const store: ConnectionStore = {
    load: async () => state.conn,
    saveTokens: async (t) => { if (state.conn) state.conn = { ...state.conn, ...t }; },
    markDisconnected: async (reason) => { state.disconnected.push(reason); if (state.conn) state.conn = { ...state.conn, disconnectedReason: reason }; },
  };
  return { state, store };
}
const conn = (expiresInMs: number): StoredConnection => ({
  shopId: BigInt(77), accessTokenEnc: encryptToken('old-access', KEY), refreshTokenEnc: encryptToken('old-refresh', KEY),
  accessExpiresAt: new Date(Date.now() + expiresInMs), disconnectedReason: null,
});
const tokenRes = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('getEtsyClient', () => {
  it('platný token → klient bez refreshe', async () => {
    const fetchImpl = vi.fn();
    const { store } = memStore(conn(60 * 60_000));
    expect(await getEtsyClient({ store, fetchImpl: fetchImpl as unknown as typeof fetch })).not.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('token vyprší za 2 min → refresh a uložení nových šifrovaných tokenů', async () => {
    const { state, store } = memStore(conn(2 * 60_000));
    const client = await getEtsyClient({ store, fetchImpl: tokenRes(200, { access_token: '1.new', refresh_token: '1.newr', expires_in: 3600 }) });
    expect(client).not.toBeNull();
    expect(decryptToken(state.conn!.accessTokenEnc, KEY)).toBe('1.new');
    expect(decryptToken(state.conn!.refreshTokenEnc, KEY)).toBe('1.newr');
    expect(state.conn!.accessExpiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });
  it('refresh 400 → null, odpojeno, upozornění jen jednou i při dalším volání', async () => {
    const { state, store } = memStore(conn(60_000));
    const alert = vi.fn(async () => {});
    const deps = { store, fetchImpl: tokenRes(400, { error: 'invalid_grant' }), alert };
    expect(await getEtsyClient(deps)).toBeNull();
    expect(await getEtsyClient(deps)).toBeNull();
    expect(state.disconnected).toEqual(['refresh_failed']);
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it('I5: refresh 503 → výjimka k opakování (retryable), NEodpojí', async () => {
    const { state, store } = memStore(conn(60_000));
    await expect(getEtsyClient({ store, fetchImpl: tokenRes(503, {}) })).rejects.toMatchObject({ retryable: true });
    expect(state.disconnected).toEqual([]);
  });
  it('I3: dvě souběžné obnovy → jen jeden požadavek na Etsy', async () => {
    const { store } = memStore(conn(60_000));
    let calls = 0;
    const fetchImpl = (async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return new Response(JSON.stringify({ access_token: '1.n', refresh_token: '1.r', expires_in: 3600 }), { status: 200 }); }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([getEtsyClient({ store, fetchImpl }), getEtsyClient({ store, fetchImpl })]);
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    expect(calls).toBe(1);
  });
  it('I3: 400 na starý refresh token, ale v DB už je nový (obnovil jiný proces) → neodpojit', async () => {
    const { state, store } = memStore(conn(60_000));
    const origLoad = store.load;
    let n = 0;
    store.load = async () => { n++; if (n === 2 && state.conn) state.conn = { ...state.conn, refreshTokenEnc: encryptToken('jiny-novy', KEY), accessTokenEnc: encryptToken('jiny-access', KEY), accessExpiresAt: new Date(Date.now() + 3600_000) }; return origLoad(); };
    const client = await getEtsyClient({ store, fetchImpl: tokenRes(400, { error: 'invalid_grant' }) });
    expect(client).not.toBeNull();
    expect(state.disconnected).toEqual([]);
  });
  it('bez konfigurace → null', async () => {
    delete process.env.ETSY_KEYSTRING;
    expect(await getEtsyClient({ store: memStore(conn(3600_000)).store })).toBeNull();
  });
});

describe('OAuth cookie', () => {
  it('podepsaná cookie se přečte zpět', () => {
    const c = signOauthCookie({ verifier: 'v', state: 's', userId: 3 });
    expect(readOauthCookie(c)).toMatchObject({ verifier: 'v', state: 's', userId: 3 });
  });
  it('změněná nebo prošlá cookie → null', () => {
    const c = signOauthCookie({ verifier: 'v', state: 's', userId: 3 });
    expect(readOauthCookie(c.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')))).toBeNull();
    const old = signOauthCookie({ verifier: 'v', state: 's', userId: 3 }, Date.now() - 11 * 60_000);
    expect(readOauthCookie(old)).toBeNull();
  });
});

describe('odložené drobnosti (cookie)', () => {
  it('M8: bez NEXTAUTH_SECRET se cookie nepodepíše prázdným klíčem', () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signOauthCookie({ verifier: 'v', state: 's', userId: 1 })).toThrow();
    expect(readOauthCookie('x.y')).toBeNull();
  });
});
