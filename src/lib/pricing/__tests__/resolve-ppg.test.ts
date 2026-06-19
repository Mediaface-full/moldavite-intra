/**
 * Per-Box PPG fallback řetězec — testy.
 * Pořadí priority: Item PPG → Box PPG → Box.amount/weight → Order PPG.
 */
import { describe, it, expect } from 'vitest';
import { resolvePpg } from '../resolve';
import type { StoneInput, OrderInput } from '../types';

const baseOrder: OrderInput = {
  id: 1,
  defaultPurchasePricePerGramCzk: '100',
  allocationMethod: 'BY_WEIGHT',
  vatRatePct: '21',
  roundingStep: 10,
};

function stone(overrides: Partial<StoneInput> = {}): StoneInput {
  return {
    id: 1,
    weightGrams: '5',
    purchasePricePerGramCzk: null,
    manualPriceInclVatCzk: null,
    attrs: {
      pasShape: null,
      location: null,
      attrDamage: null,
      attrColor: [],
      attrCollectible: false,
    },
    ...overrides,
  };
}

describe('resolvePpg — fallback řetězec', () => {
  it('1. priorita: Item PPG explicitní', () => {
    const s = stone({
      purchasePricePerGramCzk: '500',
      box: {
        purchasePricePerGramCzk: '200',
        purchaseAmountCzk: '10000',
        declaredWeight: '50',
      },
    });
    const ppg = resolvePpg(s, baseOrder);
    expect(ppg?.toString()).toBe('500'); // Item přebije všechno
  });

  it('2. priorita: Box PPG explicitní (Item PPG null)', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: '200',
        purchaseAmountCzk: '10000',
        declaredWeight: '50',
      },
    });
    const ppg = resolvePpg(s, baseOrder);
    expect(ppg?.toString()).toBe('200'); // Box přebije amount/weight dopočet
  });

  it('3. priorita: Box amount / Box weight (Item + Box PPG null)', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: null,
        purchaseAmountCzk: '15000',
        declaredWeight: '50',
      },
    });
    const ppg = resolvePpg(s, baseOrder);
    expect(ppg?.toString()).toBe('300'); // 15000 / 50 = 300
  });

  it('4. priorita: Order default (Item + Box vše null)', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: null,
        purchaseAmountCzk: null,
        declaredWeight: null,
      },
    });
    const ppg = resolvePpg(s, baseOrder);
    expect(ppg?.toString()).toBe('100');
  });

  it('Bez Boxu (zpětná kompatibilita) — Item nebo Order', () => {
    const s = stone({ purchasePricePerGramCzk: null });
    delete (s as { box?: unknown }).box;
    expect(resolvePpg(s, baseOrder)?.toString()).toBe('100');

    const s2 = stone({ purchasePricePerGramCzk: '250' });
    delete (s2 as { box?: unknown }).box;
    expect(resolvePpg(s2, baseOrder)?.toString()).toBe('250');
  });

  it('Vše null → vrátí null (NEEDS_INPUT)', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: null,
        purchaseAmountCzk: null,
        declaredWeight: null,
      },
    });
    const orderBezDefault: OrderInput = { ...baseOrder, defaultPurchasePricePerGramCzk: null };
    expect(resolvePpg(s, orderBezDefault)).toBeNull();
  });

  it('Box.amount > 0 ale weight = 0 → fallback (no div by zero)', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: null,
        purchaseAmountCzk: '5000',
        declaredWeight: '0',
      },
    });
    expect(resolvePpg(s, baseOrder)?.toString()).toBe('100'); // padá na Order default
  });

  it('Box.weight > 0 ale amount = 0 → fallback', () => {
    const s = stone({
      purchasePricePerGramCzk: null,
      box: {
        purchasePricePerGramCzk: null,
        purchaseAmountCzk: '0',
        declaredWeight: '50',
      },
    });
    expect(resolvePpg(s, baseOrder)?.toString()).toBe('100');
  });

  it('Realistický scénář — 3 kazety od 3 dodavatelů', () => {
    // Zakázka: 50 000 Kč / 500 g → Order PPG 100 Kč/g
    // K0001 (Pepa): 20 000 / 200 g → 100 Kč/g (souhlasí s Order)
    // K0002 (Karel): 25 000 / 150 g → 166.67 Kč/g (drahší)
    // K0003 (Vašek): 5 000 / 150 g → 33.33 Kč/g (levnější)

    const order: OrderInput = {
      ...baseOrder,
      defaultPurchasePricePerGramCzk: '100',
    };

    const k1 = stone({ box: { purchasePricePerGramCzk: null, purchaseAmountCzk: '20000', declaredWeight: '200' } });
    const k2 = stone({ box: { purchasePricePerGramCzk: null, purchaseAmountCzk: '25000', declaredWeight: '150' } });
    const k3 = stone({ box: { purchasePricePerGramCzk: null, purchaseAmountCzk: '5000', declaredWeight: '150' } });

    expect(resolvePpg(k1, order)?.toFixed(2)).toBe('100.00');
    expect(resolvePpg(k2, order)?.toFixed(2)).toBe('166.67');
    expect(resolvePpg(k3, order)?.toFixed(2)).toBe('33.33');
  });
});
