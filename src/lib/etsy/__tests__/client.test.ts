import { describe, it, expect, beforeEach } from 'vitest';
import { EtsyClient, EtsyApiError, type EtsyListingBody } from '@/lib/etsy/client';

type Call = { url: string; init: RequestInit };
function fake(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return r();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => { process.env.ETSY_KEYSTRING = 'ks'; process.env.ETSY_SHARED_SECRET = 'secret'; });

const body: EtsyListingBody = {
  quantity: 1, title: 'Moldavite', description: 'D', price: 49, who_made: 'someone_else', when_made: 'before_2007',
  taxonomy_id: 1, shipping_profile_id: BigInt(11), readiness_state_id: BigInt(22), tags: ['a', 'b'], materials: ['moldavite'],
  is_supply: false, should_auto_renew: true,
};

describe('EtsyClient', () => {
  it('hlavičky x-api-key a Bearer u každého požadavku', async () => {
    const { calls, fetchImpl } = fake([json({ user_id: 1, shop_id: 2 })]);
    await new EtsyClient({ accessToken: 'tok', fetchImpl }).getMe();
    const h = new Headers(calls[0].init.headers);
    expect(calls[0].url).toBe('https://api.etsy.com/v3/application/users/me');
    expect(h.get('x-api-key')).toBe('ks:secret');
    expect(h.get('authorization')).toBe('Bearer tok');
  });
  it('createDraftListing: form body, quantity=1, tagy čárkou, legacy=false', async () => {
    const { calls, fetchImpl } = fake([json({ listing_id: 5, state: 'draft' })]);
    const r = await new EtsyClient({ accessToken: 'tok', shopId: BigInt(77), fetchImpl }).createDraftListing(body);
    expect(r.listing_id).toBe(5);
    expect(calls[0].url).toBe('https://api.etsy.com/v3/application/shops/77/listings?legacy=false');
    const sent = new URLSearchParams(String(calls[0].init.body));
    expect(sent.get('quantity')).toBe('1');
    expect(sent.get('tags')).toBe('a,b');
    expect(sent.get('shipping_profile_id')).toBe('11');
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
  });
  it('429 → retryable, 400 → ne; text chyby neobsahuje token', async () => {
    const c429 = new EtsyClient({ accessToken: 'tajny-token', fetchImpl: fake([json({ error: 'slow down' }, 429)]).fetchImpl });
    const e1 = await c429.getMe().catch((e) => e);
    expect(e1).toBeInstanceOf(EtsyApiError);
    expect(e1.retryable).toBe(true);
    expect(e1.status).toBe(429);
    expect(String(e1.message)).not.toContain('tajny-token');
    const e2 = await new EtsyClient({ accessToken: 't', fetchImpl: fake([json({ error: 'bad' }, 400)]).fetchImpl }).getMe().catch((e) => e);
    expect(e2.retryable).toBe(false);
  });
  it('síťová chyba → retryable EtsyApiError', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const e = await new EtsyClient({ accessToken: 't', fetchImpl }).getMe().catch((x) => x);
    expect(e).toBeInstanceOf(EtsyApiError);
    expect(e.retryable).toBe(true);
  });
  it('getPaidReceipts stránkuje (100 + 3)', async () => {
    const page = (n: number, from: number) => ({ count: 103, results: Array.from({ length: n }, (_, i) => ({ receipt_id: from + i, is_paid: true, created_timestamp: 1, transactions: [] })) });
    const { calls, fetchImpl } = fake([json(page(100, 0)), json(page(3, 100))]);
    const r = await new EtsyClient({ accessToken: 't', shopId: BigInt(77), fetchImpl }).getPaidReceipts(1_700_000_000);
    expect(r).toHaveLength(103);
    expect(calls[0].url).toContain('/shops/77/receipts?');
    expect(calls[0].url).toContain('was_paid=true');
    expect(calls[0].url).toContain('min_created=1700000000');
    expect(calls[1].url).toContain('offset=100');
  });
  it('uploadListingImage posílá multipart s obrázkem a rank', async () => {
    const { calls, fetchImpl } = fake([json({ listing_image_id: 9 })]);
    const r = await new EtsyClient({ accessToken: 't', shopId: BigInt(77), fetchImpl }).uploadListingImage(5, Buffer.from([0xff, 0xd8]), 2, 'K0001-0001-1.jpg');
    expect(r.listing_image_id).toBe(9);
    const fd = calls[0].init.body as FormData;
    expect(fd.get('rank')).toBe('2');
    expect(fd.get('image')).toBeInstanceOf(Blob);
  });
});
