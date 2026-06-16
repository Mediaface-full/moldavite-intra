import { describe, it, expect } from 'vitest';
import { resolveMargin } from '../margin';
import type { StoneInput, PricingConfigSnapshot } from '../types';

function buildStone(overrides: Partial<StoneInput> = {}): StoneInput {
  return {
    id: 1,
    weightGrams: '5',
    purchasePricePerGramCzk: '100',
    manualPriceInclVatCzk: null,
    attrs: {
      pasShape: 'kapka',
      location: 'Ježkovna',
      attrDamage: 'none',
      attrColor: ['zelená'],
      attrCollectible: false,
    },
    ...overrides,
  };
}

describe('resolveMargin — bracket pravidlo', () => {
  const config: PricingConfigSnapshot = {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      {
        key: 'weightBracket',
        type: 'bracket',
        source: 'weightGrams',
        brackets: [
          { min: 0, max: 3, marginRate: 1.0 },
          { min: 3, max: 10, marginRate: 1.5 },
          { min: 10, max: null, marginRate: 2.0 }, // open-ended
        ],
      },
    ],
  };

  it('matchuje na první vyhovující interval', () => {
    expect(resolveMargin(buildStone({ weightGrams: '2' }), config).totalRate.toString()).toBe('1');
    expect(resolveMargin(buildStone({ weightGrams: '5' }), config).totalRate.toString()).toBe('1.5');
    expect(resolveMargin(buildStone({ weightGrams: '100' }), config).totalRate.toString()).toBe('2');
  });

  it('chybějící váha → marže 0, issue (warn default)', () => {
    const r = resolveMargin(buildStone({ weightGrams: null }), config);
    expect(r.totalRate.toString()).toBe('0');
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].severity).toBe('warn');
    expect(r.issues[0].code).toBe('MISSING_ATTR');
  });

  it('chybějící váha + missingPolicy=error → error issue', () => {
    const cfg: PricingConfigSnapshot = { ...config, rules: [{ ...config.rules[0], missingPolicy: 'error' } as never] };
    const r = resolveMargin(buildStone({ weightGrams: null }), cfg);
    expect(r.issues[0].severity).toBe('error');
  });

  it('chybějící váha + missingPolicy=zero → no issue', () => {
    const cfg: PricingConfigSnapshot = { ...config, rules: [{ ...config.rules[0], missingPolicy: 'zero' } as never] };
    const r = resolveMargin(buildStone({ weightGrams: null }), cfg);
    expect(r.issues.length).toBe(0);
  });
});

describe('resolveMargin — category pravidlo', () => {
  const config: PricingConfigSnapshot = {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      {
        key: 'shape',
        type: 'category',
        source: 'pasShape',
        items: [
          { value: 'kapka', marginRate: 0.7 },
          { value: 'disk', marginRate: 0.5 },
        ],
      },
    ],
  };

  it('matchuje na hodnotu', () => {
    expect(resolveMargin(buildStone({ attrs: { ...buildStone().attrs, pasShape: 'kapka' } }), config).totalRate.toString()).toBe('0.7');
  });

  it('neznámá hodnota → UNKNOWN_ATTR_VALUE issue', () => {
    const r = resolveMargin(buildStone({ attrs: { ...buildStone().attrs, pasShape: 'nečekaná' } }), config);
    expect(r.totalRate.toString()).toBe('0');
    expect(r.issues[0].code).toBe('UNKNOWN_ATTR_VALUE');
  });

  it('prázdná hodnota → MISSING_ATTR', () => {
    const r = resolveMargin(buildStone({ attrs: { ...buildStone().attrs, pasShape: '' } }), config);
    expect(r.issues[0].code).toBe('MISSING_ATTR');
  });
});

describe('resolveMargin — multi-category combine', () => {
  const base: PricingConfigSnapshot = {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      {
        key: 'color',
        type: 'multi-category',
        source: 'attrColor',
        combine: 'max',
        items: [
          { value: 'zelená', marginRate: 0 },
          { value: 'modrá', marginRate: 0.25 },
          { value: 'radioaktivní', marginRate: 0.1 },
        ],
      },
    ],
  };

  it('combine=max → vezme nejvyšší', () => {
    const r = resolveMargin(
      buildStone({ attrs: { ...buildStone().attrs, attrColor: ['zelená', 'modrá', 'radioaktivní'] } }),
      base
    );
    expect(r.totalRate.toString()).toBe('0.25');
  });

  it('combine=sum → sečte všechny', () => {
    const cfg = { ...base, rules: [{ ...base.rules[0], combine: 'sum' } as never] };
    const r = resolveMargin(
      buildStone({ attrs: { ...buildStone().attrs, attrColor: ['zelená', 'modrá', 'radioaktivní'] } }),
      cfg
    );
    expect(r.totalRate.toString()).toBe('0.35');
  });

  it('combine=priority-first → vezme prvního podle pořadí v items[]', () => {
    const cfg = { ...base, rules: [{ ...base.rules[0], combine: 'priority-first' } as never] };
    const r = resolveMargin(
      buildStone({ attrs: { ...buildStone().attrs, attrColor: ['radioaktivní', 'modrá'] } }),
      cfg
    );
    // v items[]: zelená(1), modrá(2), radioaktivní(3) → modrá je první v pořadí mezi matched → 0.25
    expect(r.totalRate.toString()).toBe('0.25');
  });

  it('neznámá hodnota mezi známými → UNKNOWN_ATTR_VALUE issue, ale matched dostane marže', () => {
    const r = resolveMargin(
      buildStone({ attrs: { ...buildStone().attrs, attrColor: ['modrá', 'exotická'] } }),
      base
    );
    expect(r.totalRate.toString()).toBe('0.25');
    expect(r.issues.find((i) => i.code === 'UNKNOWN_ATTR_VALUE')).toBeDefined();
  });
});

describe('resolveMargin — boolean pravidlo', () => {
  const config: PricingConfigSnapshot = {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      { key: 'collectible', type: 'boolean', source: 'attrCollectible', marginRate: 0.3 },
    ],
  };

  it('true → marže', () => {
    const r = resolveMargin(buildStone({ attrs: { ...buildStone().attrs, attrCollectible: true } }), config);
    expect(r.totalRate.toString()).toBe('0.3');
  });

  it('false → 0', () => {
    const r = resolveMargin(buildStone({ attrs: { ...buildStone().attrs, attrCollectible: false } }), config);
    expect(r.totalRate.toString()).toBe('0');
  });
});

describe('resolveMargin — kombinace pravidel sečtená', () => {
  const config: PricingConfigSnapshot = {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      { key: 'shape', type: 'category', source: 'pasShape', items: [{ value: 'kapka', marginRate: 0.7 }] },
      { key: 'location', type: 'category', source: 'location', items: [{ value: 'Ježkovna', marginRate: 0.2 }] },
      { key: 'collectible', type: 'boolean', source: 'attrCollectible', marginRate: 0.3 },
    ],
  };

  it('součet je 0.7 + 0.2 + 0 = 0.9 (collectible=false)', () => {
    const r = resolveMargin(buildStone(), config);
    expect(r.totalRate.toString()).toBe('0.9');
  });

  it('součet je 0.7 + 0.2 + 0.3 = 1.2 (collectible=true)', () => {
    const r = resolveMargin(buildStone({ attrs: { ...buildStone().attrs, attrCollectible: true } }), config);
    expect(r.totalRate.toString()).toBe('1.2');
  });
});
