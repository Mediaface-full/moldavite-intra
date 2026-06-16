/**
 * Integrační test proti fixture z BM cenotvorby:
 *   /Users/petrperina/CLOUDS/WORK-ACTUAL/BM/CENOTVORBA/cenotvorba_claude_code_module/pricing.fixture.json
 *
 * Fixture obsahuje 4 vltavíny s reálnými marže/váhy/PPG a očekávané výsledky
 * pro 3 alokační metody. Test ověřuje, že náš modul produkuje **stejné**
 * `recommendedPrice` jako referenční Excel-based výpočet.
 *
 * Mapování fixture struktury na naše typy:
 *   fixture.marginConfig  →  PricingConfigSnapshot s 5 category rules
 *   fixture.totalJobCosts →  jedna OrderCostItem s celkovou částkou
 *   fixture.items[i]      →  StoneInput (sizeCategory v fixture je už řešená,
 *                            ale v našem modelu by se odvozovala z weightBracket;
 *                            pro tento test ji předáme jako vlastní attr aby
 *                            sedělo 1:1 s referenčním Excelem)
 */
import { describe, it, expect } from 'vitest';
import { calculateOrderPricing } from '../calculate';
import type {
  OrderPricingInput,
  PricingConfigSnapshot,
  StoneInput,
  AllocationMethod,
} from '../types';

const MARGIN_CONFIG = {
  sizeCategory: {
    'malé 0,1g - 3g': 1,
    'střední 3,1g - 9,9g': 1.5,
    'velké 10g - (s poškozením)': 1.5,
    'sbírkové 10g  - (bez poškození)': 2,
  },
  shape: {
    'běžný': 0,
    'kapka': 0.7,
    'tyčka': 0.5,
    'činka': 0.7,
    'koule': 0.5,
    'disk': 0.5,
    'puldisk': 0.5,
  },
  damage: {
    'bez poškození': 1,
    'mikroodlesk': -0.05,
    'odlesk': -0.1,
    'setření z vrstvy': -0.03,
    'opravovaný': -0.05,
  },
  locality: {
    'Ježkovna': 0.2,
    'Gíďa má zbytek': 0,
  },
  color: {
    'zelená': 0,
    'radioaktivní zelená': 0.1,
    'namodralá': 0.25,
    'nahnědlá': 0,
  },
};

const TOTAL_JOB_COSTS = 16150;
const VAT_RATE = 21;
const ROUNDING_STEP = 10;

const ITEMS_RAW = [
  { id: 1, weight: 1.2, ppg: 180, sizeCategory: 'malé 0,1g - 3g', shape: 'kapka', damage: 'bez poškození', locality: 'Ježkovna', color: 'zelená' },
  { id: 2, weight: 4.8, ppg: 185, sizeCategory: 'střední 3,1g - 9,9g', shape: 'běžný', damage: 'mikroodlesk', locality: 'Gíďa má zbytek', color: 'radioaktivní zelená' },
  { id: 3, weight: 11.3, ppg: 200, sizeCategory: 'velké 10g - (s poškozením)', shape: 'činka', damage: 'odlesk', locality: 'Ježkovna', color: 'namodralá' },
  { id: 4, weight: 14.7, ppg: 180, sizeCategory: 'sbírkové 10g  - (bez poškození)', shape: 'disk', damage: 'bez poškození', locality: 'Gíďa má zbytek', color: 'nahnědlá' },
];

// Fixture používá 5 oddělených category atributů. V našem modelu používáme
// `pasShape` pro tvar, `location` pro lokalitu, `attrDamage` pro poškození,
// `attrColor[]` pro barvu (multi, ale tu jen jedna hodnota). `sizeCategory`
// jako separátní category pravidlo (klíč = libovolný string source).
//
// Pro to namapujeme: stone.attrs.sizeCategory = string, a v rule budeme
// číst source: 'sizeCategory'. Náš margin.ts to umožňuje (readAttr je generic).
function buildConfig(): PricingConfigSnapshot {
  return {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      {
        key: 'sizeCategory',
        type: 'category',
        source: 'sizeCategory' as never, // custom source mimo StoneAttrs interface
        items: Object.entries(MARGIN_CONFIG.sizeCategory).map(([value, marginRate]) => ({ value, marginRate })),
      },
      {
        key: 'shape',
        type: 'category',
        source: 'pasShape',
        items: Object.entries(MARGIN_CONFIG.shape).map(([value, marginRate]) => ({ value, marginRate })),
      },
      {
        key: 'damage',
        type: 'category',
        source: 'attrDamage',
        items: Object.entries(MARGIN_CONFIG.damage).map(([value, marginRate]) => ({ value, marginRate })),
      },
      {
        key: 'locality',
        type: 'category',
        source: 'location',
        items: Object.entries(MARGIN_CONFIG.locality).map(([value, marginRate]) => ({ value, marginRate })),
      },
      {
        key: 'color',
        type: 'multi-category',
        source: 'attrColor',
        combine: 'sum',
        items: Object.entries(MARGIN_CONFIG.color).map(([value, marginRate]) => ({ value, marginRate })),
      },
    ],
  };
}

function buildStones(): StoneInput[] {
  return ITEMS_RAW.map((it) => ({
    id: it.id,
    weightGrams: String(it.weight),
    purchasePricePerGramCzk: String(it.ppg),
    manualPriceInclVatCzk: null,
    attrs: {
      pasShape: it.shape,
      location: it.locality,
      attrDamage: it.damage,
      attrColor: [it.color],
      attrCollectible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sizeCategory: it.sizeCategory as any,
    } as never,
  }));
}

function buildInput(method: AllocationMethod): OrderPricingInput {
  return {
    order: {
      id: 1,
      defaultPurchasePricePerGramCzk: null,
      allocationMethod: method,
      vatRatePct: String(VAT_RATE),
      roundingStep: ROUNDING_STEP,
    },
    stones: buildStones(),
    costs: [
      {
        id: 1,
        amountCzk: String(TOTAL_JOB_COSTS),
        allocationMethodOverride: null,
      },
    ],
    config: buildConfig(),
  };
}

describe('BM fixture — referenční Excel výsledky', () => {
  describe('alokace BY_WEIGHT', () => {
    const result = calculateOrderPricing(buildInput('BY_WEIGHT'));

    it.each([
      [1, '216.00',  '605.62', 1760],
      [2, '888.00',  '2422.50', 5680],
      [3, '2260.00', '5702.97', 16610],
      [4, '2646.00', '7418.91', 23390],
    ])('item-%i: purchase=%s, allocated≈%s, recommendedPrice=%i', (id, purchase, _allocated, recommended) => {
      const r = result.perStone.find((s) => s.stoneId === id);
      expect(r).toBeDefined();
      expect(r!.steps).not.toBeNull();
      expect(r!.steps!.purchasePriceCzk).toBe(purchase);
      expect(Number(r!.steps!.recommendedPriceInclVatCzk)).toBe(recommended);
    });

    it('součet alokovaných nákladů přesně sedí na totalJobCosts (haléřově)', () => {
      const sum = result.perStone.reduce(
        (acc, s) => acc + Number(s.steps?.allocatedOrderCostCzk ?? 0),
        0
      );
      expect(sum).toBeCloseTo(TOTAL_JOB_COSTS, 2);
    });
  });

  describe('alokace BY_PURCHASE_PRICE', () => {
    const result = calculateOrderPricing(buildInput('BY_PURCHASE_PRICE'));

    it.each([
      [1, 1730],
      [2, 5630],
      [3, 17060],
      [4, 23020],
    ])('item-%i: recommendedPrice=%i', (id, recommended) => {
      const r = result.perStone.find((s) => s.stoneId === id);
      expect(Number(r!.steps!.recommendedPriceInclVatCzk)).toBe(recommended);
    });

    it('součet alokovaných nákladů přesně sedí na totalJobCosts', () => {
      const sum = result.perStone.reduce(
        (acc, s) => acc + Number(s.steps?.allocatedOrderCostCzk ?? 0),
        0
      );
      expect(sum).toBeCloseTo(TOTAL_JOB_COSTS, 2);
    });
  });

  describe('alokace EQUAL_PER_PIECE', () => {
    // POZN: fixture (pricing.fixture.json + IMPLEMENTATION_MODULE.md tabulka)
    // obsahuje 2 numerické nesrovnalosti pro EQUAL:
    //   item-2: fixture 7620 → matematicky 7630 (888 + 888×1.55 + 4037.5 = 6301.9, ×1.21 = 7625.30, ceil/10 = 7630)
    //   item-4: fixture 19550 → matematicky 19300 (2646 + 2646×3.5 + 4037.5 = 15944.5, ×1.21 = 19292.85, ceil/10 = 19300)
    // item-1 a item-3 v fixture sedí přesně s naším výpočtem (5910, 14600).
    // Test používá MATEMATICKY správné hodnoty — fixture je inspirace, ne kanonický zdroj.
    const result = calculateOrderPricing(buildInput('EQUAL_PER_PIECE'));

    it.each([
      [1, 5910],
      [2, 7630],  // fixture 7620, math 7630
      [3, 14600],
      [4, 19300], // fixture 19550, math 19300
    ])('item-%i: recommendedPrice=%i', (id, recommended) => {
      const r = result.perStone.find((s) => s.stoneId === id);
      expect(Number(r!.steps!.recommendedPriceInclVatCzk)).toBe(recommended);
    });

    it('každý kámen má stejnou alokaci 4037.50', () => {
      for (const s of result.perStone) {
        expect(s.steps!.allocatedOrderCostCzk).toBe('4037.50');
      }
    });
  });
});
