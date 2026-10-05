import { describe, it, expect } from 'vitest';
import { listingDates } from '@/lib/items/listingDates';

const now = new Date('2026-10-05T07:00:00Z');

describe('listingDates', () => {
  it('false → true zapíše datum', () => {
    expect(listingDates({ onShop: false, onEtsy: false }, { onShop: true, onEtsy: true }, now)).toEqual({ onShopAt: now, onEtsyAt: now });
  });
  it('true → true nepřepíše původní datum', () => {
    expect(listingDates({ onShop: true, onEtsy: true }, { onShop: true, onEtsy: true }, now)).toEqual({});
  });
  it('vypnutí datum nemaže a neexistující kámen nic', () => {
    expect(listingDates({ onShop: true, onEtsy: false }, { onShop: false }, now)).toEqual({});
    expect(listingDates(undefined, { onShop: true }, now)).toEqual({});
  });
});
