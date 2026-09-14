import { describe, it, expect } from 'vitest';
import { buildItemParams, weightRange, type AttrDict, type ParamItem } from '@/lib/exportParams';

const dict: AttrDict = {
  'location:Besednice': { label: 'Besednice', labelEn: 'Besednice (Czech Rep.)' },
  'attrColor:zelena': { label: 'Zelená', labelEn: 'Green' },
  'attrColor:olivova': { label: 'Olivová', labelEn: null },          // labelEn chybí → fallback label
  'attrDamage:none': { label: 'Bez poškození', labelEn: 'No damage' },
};

const base: ParamItem = {
  weight: '3.45',
  weightCt: 0,
  location: 'Besednice',
  pasShape: 'DROP',
  attrColor: ['zelena', 'olivova'],
  attrDamage: 'none',
  attrCollectible: true,
  salePrice: 1250,
  priceEUR: 51,
  priceUSD: 0,
};

const get = (ps: ReturnType<typeof buildItemParams>, name: string) => ps.filter((p) => p.name === name).map((p) => p.value);

describe('buildItemParams — obě jazykové sady', () => {
  const ps = buildItemParams(base, dict);

  it('Lokalita CZ + Location EN z číselníku', () => {
    expect(get(ps, 'Lokalita')).toEqual(['Besednice']);
    expect(get(ps, 'Location')).toEqual(['Besednice (Czech Rep.)']);
  });

  it('Tvar / Shape z PAS_SHAPES (jedna hodnota, ne „CZ / EN")', () => {
    expect(get(ps, 'Tvar')).toEqual(['Kapka']);
    expect(get(ps, 'Shape')[0]).toMatch(/Drop/);
    expect(get(ps, 'Tvar')[0]).not.toContain('/');
  });

  it('Velikost/Size + rozsah + gramy + karáty (fallback ct = g × 5)', () => {
    expect(get(ps, 'Velikost')).toEqual(['Střední']);
    expect(get(ps, 'Size')).toEqual(['Medium']);
    expect(get(ps, 'Hmotnostní kategorie')).toEqual(['3–5 g']);
    expect(get(ps, 'Weight range')).toEqual(['3–5 g']);
    expect(get(ps, 'Hmotnost')).toEqual(['3.45 g']);
    expect(get(ps, 'Weight (ct)')).toEqual(['17.25 ct']);
  });

  it('Barva multi — každá hodnota samostatný PARAM, EN fallback na CZ label', () => {
    expect(get(ps, 'Barva')).toEqual(['Zelená', 'Olivová']);
    expect(get(ps, 'Color')).toEqual(['Green', 'Olivová']);
  });

  it('Stav/Condition + Sbírkový kus Ano/Yes + ceny jen > 0', () => {
    expect(get(ps, 'Stav')).toEqual(['Bez poškození']);
    expect(get(ps, 'Condition')).toEqual(['No damage']);
    expect(get(ps, 'Sbírkový kus')).toEqual(['Ano']);
    expect(get(ps, "Collector's piece")).toEqual(['Yes']);
    expect(get(ps, 'Cena CZK')).toEqual(['1250 CZK']);
    expect(get(ps, 'Cena EUR')).toEqual(['51 EUR']);
    expect(get(ps, 'Cena USD')).toEqual([]);
  });

  it('Certifikát se NEposílá (rozhodnutí 14. 9. 2026)', () => {
    expect(ps.some((p) => /certif/i.test(p.name))).toBe(false);
  });
});

describe('buildItemParams — prázdné hodnoty', () => {
  it('prázdný kámen → jen Sbírkový kus Ne/No', () => {
    const ps = buildItemParams({ weight: 0, location: '', pasShape: '', attrColor: [], attrDamage: '', attrCollectible: false }, {});
    expect(ps).toEqual([
      { name: 'Sbírkový kus', value: 'Ne' },
      { name: "Collector's piece", value: 'No' },
    ]);
  });

  it('hodnota mimo číselník → posílá se raw value v obou jazycích', () => {
    const ps = buildItemParams({ ...base, attrColor: ['tyrkysova'] }, {});
    expect(get(ps, 'Barva')).toEqual(['tyrkysova']);
    expect(get(ps, 'Color')).toEqual(['tyrkysova']);
  });
});

describe('weightRange — hranice', () => {
  it.each([
    [0.5, 'do 3 g'], [3, 'do 3 g'], [3.01, '3–5 g'], [4.99, '3–5 g'], [5, '5–10 g'],
    [9.99, '5–10 g'], [10, '10–20 g'], [19.99, '10–20 g'], [20, 'nad 20 g'], [55, 'nad 20 g'],
  ])('%s g → %s', (w, cz) => {
    expect(weightRange(w)?.cz).toBe(cz);
  });
  it('0 / NaN → null', () => {
    expect(weightRange(0)).toBeNull();
    expect(weightRange(NaN)).toBeNull();
  });
  it('Velikost a rozsah sedí na hranici 10 g (Velké + 10–20 g)', () => {
    const ps = buildItemParams({ ...base, weight: 10 }, dict);
    expect(get(ps, 'Velikost')).toEqual(['Velké']);
    expect(get(ps, 'Hmotnostní kategorie')).toEqual(['10–20 g']);
  });
});
