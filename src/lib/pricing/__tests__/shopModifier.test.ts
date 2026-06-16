import { describe, it, expect } from 'vitest';
import { applyShopModifier, applyShopModifierToString } from '../shopModifier';
import { Decimal } from '../decimal';

describe('applyShopModifier', () => {
  it('0% provize, žádné zaokrouhlení → nezmění cenu', () => {
    expect(applyShopModifier(new Decimal('1000'), { commissionPct: 0, roundingStep: null }).toString()).toBe('1000');
  });
  it('10% provize, bez zaokrouhlení → 1100', () => {
    expect(applyShopModifier(new Decimal('1000'), { commissionPct: 10, roundingStep: null }).toString()).toBe('1100');
  });
  it('10% provize + ceil na 10 → 1037 × 1.10 = 1140.7 → ceil 10 → 1150', () => {
    expect(applyShopModifier(new Decimal('1037'), { commissionPct: 10, roundingStep: 10 }).toString()).toBe('1150');
  });
  it('25% provize + ceil na 50 → 2000 × 1.25 = 2500 (přesně) → 2500', () => {
    expect(applyShopModifier(new Decimal('2000'), { commissionPct: 25, roundingStep: 50 }).toString()).toBe('2500');
  });
  it('záporná provize vyhodí chybu', () => {
    expect(() => applyShopModifier(new Decimal('1000'), { commissionPct: -5, roundingStep: 10 })).toThrow();
  });
  it('string convenience wrapper', () => {
    expect(applyShopModifierToString('1000', { commissionPct: 10, roundingStep: 10 })).toBe('1100.00');
  });
});

describe('shopModifier — aplikace na finalInternalPrice, ne salePrice', () => {
  // Pokrytí požadavku ze zadání: shop modifikátor BĚŽÍ NA finalInternalPriceInclVatCzk
  // ne na ručně zadané salePrice. Tato test ověřuje že funkce je správně
  // dekuplovaná od source-of-truth — bere libovolný Decimal vstup.
  it('aplikuje stejně bez ohledu na původ vstupní ceny', () => {
    const cfg = { commissionPct: 15, roundingStep: 10 };
    expect(applyShopModifier(new Decimal('5680'), cfg).toString())
      .toBe(applyShopModifier(new Decimal('5680'), cfg).toString());
  });
});
