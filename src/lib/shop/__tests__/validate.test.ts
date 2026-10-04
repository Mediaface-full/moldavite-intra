import { describe, it, expect } from 'vitest';
import { parseReservationBody, parseSoldBody, positiveInt } from '@/lib/shop/validate';

describe('Shop API validace vstupů', () => {
  it('positiveInt odmítá "12abc", 0, záporné, desetinné', () => {
    expect(positiveInt('12abc')).toBeNull();
    expect(positiveInt(0)).toBeNull();
    expect(positiveInt(-1)).toBeNull();
    expect(positiveInt(1.5)).toBeNull();
    expect(positiveInt('42')).toBe(42);
  });
  it('rezervace: výchozí TTL 1800 s, ref jen bezpečné znaky', () => {
    expect(parseReservationBody({ itemId: 5, ref: 'wc-abc_1' })).toEqual({ itemId: 5, ref: 'wc-abc_1', ttlSeconds: 1800 });
    expect(parseReservationBody({ itemId: 5, ref: '<script>' })).toEqual({ invalid: 'ref' });
    expect(parseReservationBody({ itemId: 'x', ref: 'a' })).toEqual({ invalid: 'itemId' });
    expect(parseReservationBody(null)).toEqual({ invalid: 'body' });
  });
  it('prodej: orderNumber povinné, paidAt validní datum, audit jen čísla a kód měny', () => {
    const ok = parseSoldBody({ itemId: 5, orderNumber: 'BM-2026-1042', paidAt: '2026-10-04T10:00:00Z', priceCzk: 12900, currency: 'EUR', priceInCurrency: 529, extra: 'x' });
    expect('invalid' in ok).toBe(false);
    if ('invalid' in ok) return;
    expect(ok.paidAt?.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    expect(JSON.parse(ok.details)).toEqual({ orderNumber: 'BM-2026-1042', priceCzk: 12900, currency: 'EUR', priceInCurrency: 529 });
    expect(parseSoldBody({ itemId: 5, orderNumber: 'a b' })).toEqual({ invalid: 'orderNumber' });
    expect(parseSoldBody({ itemId: 5, orderNumber: 'X1', paidAt: 'nonsense' })).toEqual({ invalid: 'paidAt' });
  });
});
