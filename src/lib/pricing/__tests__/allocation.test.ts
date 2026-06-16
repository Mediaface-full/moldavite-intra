import { describe, it, expect } from 'vitest';
import { allocateCosts } from '../allocation';
import { Decimal } from '../decimal';
import type { OrderCostInput, StoneInput, AllocationMethod } from '../types';

function s(id: number, weight: number, ppg: number): StoneInput {
  return {
    id,
    weightGrams: String(weight),
    purchasePricePerGramCzk: String(ppg),
    manualPriceInclVatCzk: null,
    attrs: { pasShape: null, location: null, attrDamage: null, attrColor: [], attrCollectible: false },
  };
}

function c(id: number, amount: number, override: AllocationMethod | null = null): OrderCostInput {
  return { id, amountCzk: String(amount), allocationMethodOverride: override };
}

function ppgMap(stones: StoneInput[]): Map<number, Decimal | null> {
  const m = new Map<number, Decimal | null>();
  for (const st of stones) m.set(st.id, new Decimal(st.purchasePricePerGramCzk ?? '0'));
  return m;
}

describe('alokace — BY_WEIGHT', () => {
  const stones = [s(1, 1.2, 180), s(2, 4.8, 185), s(3, 11.3, 200), s(4, 14.7, 180)];
  const ctx = { resolvedPpgByStoneId: ppgMap(stones) };

  it('rozdělí podle gramáže', () => {
    const r = allocateCosts([c(1, 16150)], stones, 'BY_WEIGHT', ctx);
    expect(r.perStone.get(1)!.toString()).toBe('605.62');
    expect(r.perStone.get(2)!.toString()).toBe('2422.5');
    expect(r.perStone.get(3)!.toString()).toBe('5702.97');
    expect(r.perStone.get(4)!.toString()).toBe('7418.91');
  });

  it('INVARIANT: součet = totalCostsCzk přesně', () => {
    const r = allocateCosts([c(1, 16150)], stones, 'BY_WEIGHT', ctx);
    let sum = new Decimal(0);
    for (const v of r.perStone.values()) sum = sum.plus(v);
    expect(sum.toString()).toBe('16150');
  });
});

describe('alokace — BY_PURCHASE_PRICE', () => {
  const stones = [s(1, 1.2, 180), s(2, 4.8, 185), s(3, 11.3, 200), s(4, 14.7, 180)];
  const ctx = { resolvedPpgByStoneId: ppgMap(stones) };

  it('rozdělí podle nákupní ceny (drahý dostane víc)', () => {
    const r = allocateCosts([c(1, 16150)], stones, 'BY_PURCHASE_PRICE', ctx);
    // sum purchase = 216 + 888 + 2260 + 2646 = 6010
    // item-4 share = 2646/6010 × 16150 = 7110.30
    expect(r.perStone.get(4)!.toString()).toBe('7110.3');
  });

  it('INVARIANT: součet = totalCostsCzk přesně', () => {
    const r = allocateCosts([c(1, 16150)], stones, 'BY_PURCHASE_PRICE', ctx);
    let sum = new Decimal(0);
    for (const v of r.perStone.values()) sum = sum.plus(v);
    expect(sum.toString()).toBe('16150');
  });
});

describe('alokace — EQUAL_PER_PIECE', () => {
  const stones = [s(1, 1.2, 180), s(2, 4.8, 185), s(3, 11.3, 200), s(4, 14.7, 180)];
  const ctx = { resolvedPpgByStoneId: ppgMap(stones) };

  it('rozdělí stejnoměrně', () => {
    const r = allocateCosts([c(1, 16150)], stones, 'EQUAL_PER_PIECE', ctx);
    expect(r.perStone.get(1)!.toString()).toBe('4037.5');
    expect(r.perStone.get(2)!.toString()).toBe('4037.5');
    expect(r.perStone.get(3)!.toString()).toBe('4037.5');
    expect(r.perStone.get(4)!.toString()).toBe('4037.5');
  });
});

describe('alokace — per-cost-item override', () => {
  const stones = [s(1, 1.2, 180), s(2, 4.8, 185), s(3, 11.3, 200), s(4, 14.7, 180)];
  const ctx = { resolvedPpgByStoneId: ppgMap(stones) };

  it('různé metody pro různé náklady, součet stále sedí', () => {
    const r = allocateCosts(
      [
        c(1, 2000, 'BY_WEIGHT'),         // doprava
        c(2, 5000, 'BY_PURCHASE_PRICE'), // clo
        c(3, 800, 'EQUAL_PER_PIECE'),    // balné
      ],
      stones,
      'BY_WEIGHT', // default, ale všechny costs mají override
      ctx
    );
    let sum = new Decimal(0);
    for (const v of r.perStone.values()) sum = sum.plus(v);
    expect(sum.toString()).toBe('7800');
    expect(r.totalCostsCzk.toString()).toBe('7800');
  });
});

describe('alokace — largest remainder residual (haléře)', () => {
  it('součet po zaokrouhlení sedí přesně i u podivných poměrů', () => {
    // 3 kameny, váhy 1/3/7 → poměry 1/11, 3/11, 7/11
    // 100 Kč rozdělit: 9.0909..., 27.2727..., 63.6363...
    // Floor: 9.09 + 27.27 + 63.63 = 99.99 → residual 0.01 → největší zbytek = item-3 (.36)
    // Final: 9.09, 27.27, 63.64 = 100.00
    const stones = [s(1, 1, 100), s(2, 3, 100), s(3, 7, 100)];
    const ctx = { resolvedPpgByStoneId: ppgMap(stones) };
    const r = allocateCosts([c(1, 100)], stones, 'BY_WEIGHT', ctx);
    let sum = new Decimal(0);
    for (const v of r.perStone.values()) sum = sum.plus(v);
    expect(sum.toString()).toBe('100');
  });

  it('deterministicky stejný výstup pro stejný vstup', () => {
    const stones = [s(1, 1, 100), s(2, 3, 100), s(3, 7, 100)];
    const ctx = { resolvedPpgByStoneId: ppgMap(stones) };
    const r1 = allocateCosts([c(1, 100)], stones, 'BY_WEIGHT', ctx);
    const r2 = allocateCosts([c(1, 100)], stones, 'BY_WEIGHT', ctx);
    expect(r1.perStone.get(1)!.toString()).toBe(r2.perStone.get(1)!.toString());
    expect(r1.perStone.get(2)!.toString()).toBe(r2.perStone.get(2)!.toString());
    expect(r1.perStone.get(3)!.toString()).toBe(r2.perStone.get(3)!.toString());
  });
});

describe('alokace — edge cases', () => {
  it('kámen bez váhy je vyloučen z alokace (allocated = 0)', () => {
    const stones: StoneInput[] = [
      { ...s(1, 1.2, 180) },
      { ...s(2, 4.8, 185), weightGrams: null },
    ];
    const ctx = { resolvedPpgByStoneId: ppgMap([stones[0]]) };
    ctx.resolvedPpgByStoneId.set(2, null); // simulace chybějícího PPG
    const r = allocateCosts([c(1, 1000)], stones, 'BY_WEIGHT', ctx);
    expect(r.perStone.get(2)!.toString()).toBe('0');
    expect(r.perStone.get(1)!.toString()).toBe('1000'); // dostane vše
  });

  it('všechny kameny nezpůsobilé → každý dostane 0', () => {
    const stones = [s(1, 0, 0), s(2, 0, 0)];
    const ctx = { resolvedPpgByStoneId: new Map([[1, null as Decimal | null], [2, null as Decimal | null]]) };
    const r = allocateCosts([c(1, 1000)], stones, 'BY_WEIGHT', ctx);
    expect(r.perStone.get(1)!.toString()).toBe('0');
    expect(r.perStone.get(2)!.toString()).toBe('0');
  });
});
