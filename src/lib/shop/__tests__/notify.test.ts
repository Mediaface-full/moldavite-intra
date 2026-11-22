import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { notifyShopItemsChanged, shopSignature } from '@/lib/shop/notify';

beforeEach(() => { process.env.SHOP_WEBHOOK_URL = 'https://shop.example/wp-json/bm/v1/intra'; process.env.SHOP_WEBHOOK_SECRET = 'k'.repeat(64); });

describe('intra → e-shop items.changed', () => {
  it('podpis = sha256= + hex HMAC jako PHP hash_hmac', () => {
    const body = '{"event":"items.changed","ids":[1]}';
    expect(shopSignature(body, 'tajne')).toBe(`sha256=${createHmac('sha256', 'tajne').update(body).digest('hex')}`);
    // pevný vektor (PHP: hash_hmac('sha256', 'abc', 'key'))
    expect(shopSignature('abc', 'key')).toBe('sha256=9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab');
  });
  it('posílá tělo a hlavičku X-BM-Signature', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await notifyShopItemsChanged([3, 4], fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://shop.example/wp-json/bm/v1/intra');
    expect(init.body).toBe('{"event":"items.changed","ids":[3,4]}');
    expect(new Headers(init.headers).get('x-bm-signature')).toBe(shopSignature(String(init.body), 'k'.repeat(64)));
  });
  it('chyba / timeout nevyhodí; bez env nic', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyShopItemsChanged([1], (async () => { throw new Error('timeout'); }) as unknown as typeof fetch)).resolves.toBeUndefined();
    delete process.env.SHOP_WEBHOOK_URL;
    const f = vi.fn();
    await notifyShopItemsChanged([1], f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
