import { describe, it, expect } from 'vitest';
import { checkShopAuth, parseAllowedIps, tokenMatches } from '@/lib/shop/auth';
import { resetRateLimit } from '@/lib/rateLimit';

const TOKEN = 'x'.repeat(48);
const env = { token: TOKEN, allowedIps: '78.47.142.236, 10.0.0.5' };
const req = (headers: Record<string, string>) => new Request('https://app.example.com/api/shop/v1/catalog', { headers });

describe('Shop API auth (fail-closed)', () => {
  it('bez tokenu v env → 503 not_configured (nic se nevydá)', () => {
    expect(checkShopAuth(req({ 'x-forwarded-for': '78.47.142.236', authorization: `Bearer ${TOKEN}` }), { token: undefined, allowedIps: env.allowedIps }))
      .toMatchObject({ ok: false, status: 503 });
  });
  it('krátký token v env → 503', () => {
    expect(checkShopAuth(req({}), { token: 'short', allowedIps: env.allowedIps })).toMatchObject({ ok: false, status: 503 });
  });
  it('prázdný allowlist = nikdo → 403', () => {
    expect(checkShopAuth(req({ 'x-forwarded-for': '78.47.142.236', authorization: `Bearer ${TOKEN}` }), { token: TOKEN, allowedIps: '' }))
      .toMatchObject({ ok: false, status: 403 });
  });
  it('cizí IP → 403 i se správným tokenem', () => {
    expect(checkShopAuth(req({ 'x-forwarded-for': '1.2.3.4', authorization: `Bearer ${TOKEN}` }), env)).toMatchObject({ ok: false, status: 403 });
  });
  it('podvržená první hodnota X-Forwarded-For nepomůže (bere se poslední = od DSM proxy)', () => {
    expect(checkShopAuth(req({ 'x-forwarded-for': '78.47.142.236, 1.2.3.4', authorization: `Bearer ${TOKEN}` }), env)).toMatchObject({ ok: false, status: 403 });
  });
  it('povolená IP, špatný token → 401', () => {
    resetRateLimit('shop-api:10.0.0.5');
    expect(checkShopAuth(req({ 'x-forwarded-for': '10.0.0.5', authorization: 'Bearer ' + 'y'.repeat(48) }), env)).toMatchObject({ ok: false, status: 401 });
  });
  it('povolená IP + správný token → ok', () => {
    resetRateLimit('shop-api:78.47.142.236');
    expect(checkShopAuth(req({ 'x-forwarded-for': '78.47.142.236', authorization: `Bearer ${TOKEN}` }), env)).toEqual({ ok: true, ip: '78.47.142.236' });
  });
  it('rate limit 120/min → 429', () => {
    resetRateLimit('shop-api:10.0.0.5');
    let last;
    for (let i = 0; i < 121; i++) last = checkShopAuth(req({ 'x-forwarded-for': '10.0.0.5', authorization: `Bearer ${TOKEN}` }), env);
    expect(last).toMatchObject({ ok: false, status: 429 });
    resetRateLimit('shop-api:10.0.0.5');
  });
});

describe('tokenMatches / parseAllowedIps', () => {
  it('jen Bearer schéma, přesná shoda', () => {
    expect(tokenMatches(TOKEN, `Bearer ${TOKEN}`)).toBe(true);
    expect(tokenMatches(TOKEN, `Basic ${TOKEN}`)).toBe(false);
    expect(tokenMatches(TOKEN, `Bearer ${TOKEN}x`)).toBe(false);
    expect(tokenMatches(TOKEN, null)).toBe(false);
  });
  it('allowlist s mezerami', () => expect([...parseAllowedIps(' a , b,,')]).toEqual(['a', 'b']));
});
