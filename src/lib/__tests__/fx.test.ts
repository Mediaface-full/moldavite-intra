import { describe, it, expect } from 'vitest';
import { czkBaseForFx, fxPrices, perUnitRate } from '../fx';

const rates = { EUR: { rate: 24.5, quantity: 1 }, USD: { rate: 22.0, quantity: 1 }, JPY: { rate: 15.0, quantity: 100 } };

describe('czkBaseForFx', () => {
  it('finální cena má přednost před salePrice (speciální cena se promítne do EUR/USD)', () => {
    expect(czkBaseForFx({ finalInternalPriceInclVatCzk: '2500.00', salePrice: '2170.00' })).toBe(2500);
  });
  it('bez finální ceny fallback na salePrice (legacy kámen bez cenotvorby)', () => {
    expect(czkBaseForFx({ finalInternalPriceInclVatCzk: null, salePrice: '2170' })).toBe(2170);
    expect(czkBaseForFx({ finalInternalPriceInclVatCzk: '0', salePrice: '2170' })).toBe(2170);
  });
  it('nic → 0', () => {
    expect(czkBaseForFx({ finalInternalPriceInclVatCzk: null, salePrice: null })).toBe(0);
  });
});

describe('fxPrices', () => {
  it('stejný výpočet jako e-shop API: zaokrouhlené celé jednotky', () => {
    expect(fxPrices(2500, rates)).toEqual({ priceEUR: 102, priceUSD: 114 });
  });
  it('kurz za 100 jednotek se dělí quantity', () => {
    expect(perUnitRate(rates, 'JPY')).toBeCloseTo(0.15);
  });
  it('chybějící kurz → 0, ne NaN', () => {
    expect(fxPrices(2500, { EUR: { rate: 24.5 } })).toEqual({ priceEUR: 102, priceUSD: 0 });
    expect(fxPrices(0, rates)).toEqual({ priceEUR: 0, priceUSD: 0 });
  });
});
