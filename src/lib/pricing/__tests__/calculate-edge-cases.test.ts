/**
 * Edge cases ze zadání — sekce Validace + sekce Testy.
 * Pokrytí požadavku „chybějící vstupy nevyrobí tichou nesmyslnou cenu".
 */
import { describe, it, expect } from 'vitest';
import { calculateOrderPricing } from '../calculate';
import type { OrderPricingInput, PricingConfigSnapshot, StoneInput } from '../types';

const EMPTY_CONFIG: PricingConfigSnapshot = { version: 1, missingValuePolicy: 'warn', rules: [] };

function baseOrder(): OrderPricingInput['order'] {
  return {
    id: 1,
    defaultPurchasePricePerGramCzk: '100',
    allocationMethod: 'BY_WEIGHT',
    vatRatePct: '21',
    roundingStep: 10,
  };
}

function baseStone(overrides: Partial<StoneInput> = {}): StoneInput {
  return {
    id: 1,
    weightGrams: '5',
    purchasePricePerGramCzk: null,
    manualPriceInclVatCzk: null,
    attrs: { pasShape: null, location: null, attrDamage: null, attrColor: [], attrCollectible: false },
    ...overrides,
  };
}

describe('edge: kámen bez váhy', () => {
  it('status NEEDS_INPUT, steps=null, žádná tichá cena', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({ weightGrams: null })],
      costs: [],
      config: EMPTY_CONFIG,
    });
    const s = r.perStone[0];
    expect(s.status).toBe('NEEDS_INPUT');
    expect(s.steps).toBeNull();
    expect(s.finalInternalPriceInclVatCzk).toBeNull();
    expect(s.issues.some((i) => i.code === 'MISSING_WEIGHT')).toBe(true);
  });
});

describe('edge: kámen bez PPG (ani Stone ani Order default)', () => {
  it('NEEDS_INPUT + MISSING_PPG', () => {
    const order = { ...baseOrder(), defaultPurchasePricePerGramCzk: null };
    const r = calculateOrderPricing({
      order,
      stones: [baseStone()],
      costs: [],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone[0].status).toBe('NEEDS_INPUT');
    expect(r.perStone[0].issues.some((i) => i.code === 'MISSING_PPG')).toBe(true);
  });
});

describe('edge: zakázka bez nákladů', () => {
  it('alokace = 0, recommendedPrice = purchase × (1+margin) × (1+vat) ↑step', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({ weightGrams: '1', purchasePricePerGramCzk: '100' })],
      costs: [],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone[0].status).toBe('OK');
    expect(r.perStone[0].steps!.allocatedOrderCostCzk).toBe('0.00');
    // 100 × 1.21 = 121 → ceil(10) = 130 (margin = 0 → exVat = 100)
    expect(r.perStone[0].steps!.recommendedPriceInclVatCzk).toBe('130.00');
  });
});

describe('edge: zakázka bez kamenů', () => {
  it('vrátí prázdný perStone + EMPTY_ORDER warning', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [],
      costs: [{ id: 1, amountCzk: '1000', allocationMethodOverride: null }],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone).toEqual([]);
    expect(r.warnings.some((w) => w.code === 'EMPTY_ORDER')).toBe(true);
    expect(r.summary.totalAllocatedCostsCzk).toBe('1000.00');
  });
});

describe('edge: záporný náklad', () => {
  it('NEGATIVE_COST warning + náklad se ignoruje', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({ weightGrams: '1', purchasePricePerGramCzk: '100' })],
      costs: [
        { id: 1, amountCzk: '500', allocationMethodOverride: null },
        { id: 2, amountCzk: '-100', allocationMethodOverride: null },
      ],
      config: EMPTY_CONFIG,
    });
    expect(r.warnings.some((w) => w.code === 'NEGATIVE_COST')).toBe(true);
    // Záporný náklad se nezapočítá do totalAllocatedCostsCzk
    expect(r.summary.totalAllocatedCostsCzk).toBe('500.00');
    expect(r.perStone[0].steps!.allocatedOrderCostCzk).toBe('500.00');
  });
});

describe('edge: záporná marže clamps na 0', () => {
  it('marže -2 (větší než 1 = -200%) → exVat <= 0 → clamp na 0', () => {
    const cfg: PricingConfigSnapshot = {
      version: 1,
      missingValuePolicy: 'warn',
      rules: [{ key: 'shape', type: 'category', source: 'pasShape', items: [{ value: 'X', marginRate: -2 }] }],
    };
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({
        weightGrams: '1',
        purchasePricePerGramCzk: '100',
        attrs: { pasShape: 'X', location: null, attrDamage: null, attrColor: [], attrCollectible: false },
      })],
      costs: [],
      config: cfg,
    });
    // purchase=100, margin=-2 → marginAmount=-200, exVat=-100 → clamp na 0
    expect(r.perStone[0].steps!.minPriceExVatCzk).toBe('0.00');
    expect(r.perStone[0].issues.some((i) => i.code === 'NEGATIVE_PRICE_CLAMPED')).toBe(true);
  });
});

describe('edge: manualPrice < recommendedPrice → NEEDS_REVIEW', () => {
  it('finalInternalPrice fallne na recommendedPrice, status NEEDS_REVIEW', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({
        weightGrams: '1',
        purchasePricePerGramCzk: '100',
        manualPriceInclVatCzk: '100', // pod doporučenou 130
      })],
      costs: [],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone[0].status).toBe('NEEDS_REVIEW');
    expect(r.perStone[0].finalInternalPriceInclVatCzk).toBe('130.00'); // recommended, ne manual
    expect(r.perStone[0].issues.some((i) => i.code === 'MANUAL_BELOW_MIN')).toBe(true);
  });
});

describe('edge: manualPrice > recommendedPrice → použij manual', () => {
  it('OK status, finalInternal = manual', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({
        weightGrams: '1',
        purchasePricePerGramCzk: '100',
        manualPriceInclVatCzk: '200', // nad doporučenou 130
      })],
      costs: [],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone[0].status).toBe('OK');
    expect(r.perStone[0].finalInternalPriceInclVatCzk).toBe('200.00');
  });
});

describe('edge: změna allocation method dá jiný výsledek', () => {
  const stones = [
    baseStone({ id: 1, weightGrams: '1', purchasePricePerGramCzk: '1000' }), // lehký, drahý
    baseStone({ id: 2, weightGrams: '10', purchasePricePerGramCzk: '100' }), // těžký, levný
  ];

  it('BY_WEIGHT dá těžkému více, BY_PURCHASE_PRICE dá oběma stejně (1000 = 1000)', () => {
    const byW = calculateOrderPricing({
      order: { ...baseOrder(), allocationMethod: 'BY_WEIGHT' },
      stones,
      costs: [{ id: 1, amountCzk: '1100', allocationMethodOverride: null }],
      config: EMPTY_CONFIG,
    });
    // sumWeights = 11 → item-1: 1/11×1100 = 100, item-2: 10/11×1100 = 1000
    expect(byW.perStone[0].steps!.allocatedOrderCostCzk).toBe('100.00');
    expect(byW.perStone[1].steps!.allocatedOrderCostCzk).toBe('1000.00');

    const byP = calculateOrderPricing({
      order: { ...baseOrder(), allocationMethod: 'BY_PURCHASE_PRICE' },
      stones,
      costs: [{ id: 1, amountCzk: '1100', allocationMethodOverride: null }],
      config: EMPTY_CONFIG,
    });
    // sumPurchase = 1000+1000 = 2000 → oba dostanou 550
    expect(byP.perStone[0].steps!.allocatedOrderCostCzk).toBe('550.00');
    expect(byP.perStone[1].steps!.allocatedOrderCostCzk).toBe('550.00');
  });
});

describe('edge: INVARIANT — součet alokovaných nákladů = totalAllocatedCostsCzk', () => {
  it('drží napříč všemi metodami i při residuálu', () => {
    const stones = [
      baseStone({ id: 1, weightGrams: '0.7', purchasePricePerGramCzk: '237' }),
      baseStone({ id: 2, weightGrams: '3.1', purchasePricePerGramCzk: '189' }),
      baseStone({ id: 3, weightGrams: '11.3', purchasePricePerGramCzk: '157' }),
    ];
    const cost = [{ id: 1, amountCzk: '12345.67', allocationMethodOverride: null }];

    for (const method of ['BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE'] as const) {
      const r = calculateOrderPricing({
        order: { ...baseOrder(), allocationMethod: method },
        stones,
        costs: cost,
        config: EMPTY_CONFIG,
      });
      const sum = r.perStone.reduce((acc, s) => acc + Number(s.steps?.allocatedOrderCostCzk ?? 0), 0);
      expect(sum).toBeCloseTo(12345.67, 2);
    }
  });
});

describe('edge: velmi drahý kámen vedle levných (BY_PURCHASE_PRICE)', () => {
  it('drahý dostane proporčně víc nákladu', () => {
    const stones = [
      baseStone({ id: 1, weightGrams: '1', purchasePricePerGramCzk: '100' }),     // levný 100 Kč
      baseStone({ id: 2, weightGrams: '1', purchasePricePerGramCzk: '100' }),     // levný 100 Kč
      baseStone({ id: 3, weightGrams: '1', purchasePricePerGramCzk: '9800' }),    // drahý 9800 Kč
    ];
    const r = calculateOrderPricing({
      order: { ...baseOrder(), allocationMethod: 'BY_PURCHASE_PRICE' },
      stones,
      costs: [{ id: 1, amountCzk: '1000', allocationMethodOverride: null }],
      config: EMPTY_CONFIG,
    });
    // sumPurchase = 10000 → item-3 dostane 9800/10000 × 1000 = 980
    expect(r.perStone[2].steps!.allocatedOrderCostCzk).toBe('980.00');
    expect(r.perStone[0].steps!.allocatedOrderCostCzk).toBe('10.00');
    expect(r.perStone[1].steps!.allocatedOrderCostCzk).toBe('10.00');
  });
});

describe('edge: shop/Etsy modifikátor se aplikuje až NA finalInternalPrice', () => {
  // Test že calculateOrderPricing nikdy nepřidá commission — to je úloha shopModifier.
  // Důkaz: dvě stejné konfigurace, jen jiná měna - shop logika musí být dekuplovaná.
  it('výpočet zakázky vrací cenu bez shop markup; markup je responsibilita shopModifier', () => {
    const r = calculateOrderPricing({
      order: baseOrder(),
      stones: [baseStone({ weightGrams: '1', purchasePricePerGramCzk: '100' })],
      costs: [],
      config: EMPTY_CONFIG,
    });
    // recommendedPriceInclVat = 130 (100 × 1.21 = 121 → ceil 10 = 130)
    // finalInternal = 130 (žádný manualPrice)
    expect(r.perStone[0].finalInternalPriceInclVatCzk).toBe('130.00');
    // Pokud by calc.ts přidávala commission, dostaneme jiné číslo. Toto je
    // sanity check že modul drží separation of concerns.
  });
});

describe('edge: stejná váha → BY_WEIGHT dá rovnoměrně', () => {
  it('3 kameny po 5g, náklad 300 → každý 100', () => {
    const stones = [
      baseStone({ id: 1, weightGrams: '5', purchasePricePerGramCzk: '100' }),
      baseStone({ id: 2, weightGrams: '5', purchasePricePerGramCzk: '100' }),
      baseStone({ id: 3, weightGrams: '5', purchasePricePerGramCzk: '100' }),
    ];
    const r = calculateOrderPricing({
      order: { ...baseOrder(), allocationMethod: 'BY_WEIGHT' },
      stones,
      costs: [{ id: 1, amountCzk: '300', allocationMethodOverride: null }],
      config: EMPTY_CONFIG,
    });
    expect(r.perStone[0].steps!.allocatedOrderCostCzk).toBe('100.00');
    expect(r.perStone[1].steps!.allocatedOrderCostCzk).toBe('100.00');
    expect(r.perStone[2].steps!.allocatedOrderCostCzk).toBe('100.00');
  });
});
