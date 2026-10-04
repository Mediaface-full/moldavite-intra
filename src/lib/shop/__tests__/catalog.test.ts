import { describe, it, expect } from 'vitest';
import { buildCatalogItem, buildDictionaries, shopEligibility, shopPrices, type CatalogSourceItem, type DictOption } from '@/lib/shop/catalog';

const options: DictOption[] = [
  { id: 1, attrKey: 'location', value: 'Besednice', label: null, labelEn: null, sortOrder: 0, active: true },
  { id: 2, attrKey: 'pasShape', value: 'Kapka', label: 'Kapka', labelEn: 'Drop', sortOrder: 1, active: true },
  { id: 3, attrKey: 'attrColor', value: 'Lesní zelená', label: null, labelEn: 'Forest green', sortOrder: 0, active: true },
  { id: 4, attrKey: 'attrColor', value: 'Olivová', label: null, labelEn: null, sortOrder: 1, active: true },
  { id: 5, attrKey: 'attrDamage', value: 'Bez poškození', label: null, labelEn: 'Undamaged', sortOrder: 0, active: true },
  { id: 6, attrKey: 'attrColor', value: 'Stará', label: null, labelEn: null, sortOrder: 2, active: false },
  { id: 7, attrKey: 'cassetteType', value: 'Kameny', label: null, labelEn: null, sortOrder: 0, active: true },
];

const base: CatalogSourceItem = {
  id: 42, evidNumber: '0021', box: { code: 'K0006' },
  name: 'Vltavín Besednice 8,6 g', nameEn: 'Besednice Moldavite 8.6 g',
  description: 'Krátký', descriptionEn: 'Short', longDescription: '<p>Dlouhý</p>', longDescriptionEn: '',
  location: 'Besednice', pasShape: 'kapka', attrDamage: 'Bez poškození', attrColor: ['Lesní zelená', 'Olivová'], attrCollectible: true,
  weight: '8.60', weightCt: '43.00', finalInternalPriceInclVatCzk: '7900.00', pricingStatus: 'OK',
  onShop: true, onShopAt: new Date('2026-10-01T10:00:00Z'), sold: false, soldAt: null,
  certHash: '', certIssuedAt: null, photoPath: 'K0006/0021', mainPhoto: 3, storage: 'R3 / 14',
  updatedAt: new Date('2026-10-02T10:00:00Z'),
};
const photos = () => ({ photos: ['p3', 'p1'], video: null });
const ctx = { options, rates: { EUR: 24.465, USD: 21.795 }, photos };

describe('shopEligibility — stejná pravidla jako gate v PATCH /api/items/[id]', () => {
  it('OK kámen projde', () => expect(shopEligibility(base)).toBeNull());
  it('bez váhy', () => expect(shopEligibility({ ...base, weight: '0' })).toBe('no_weight'));
  it('bez finální ceny', () => expect(shopEligibility({ ...base, finalInternalPriceInclVatCzk: null })).toBe('no_price'));
  it('NEEDS_INPUT', () => expect(shopEligibility({ ...base, pricingStatus: 'NEEDS_INPUT' })).toBe('pricing_needs_input'));
  it('NEEDS_REVIEW', () => expect(shopEligibility({ ...base, pricingStatus: 'NEEDS_REVIEW' })).toBe('pricing_needs_review'));
  it('STALE projde (stejně jako v intru)', () => expect(shopEligibility({ ...base, pricingStatus: 'STALE' })).toBeNull());
});

describe('shopPrices', () => {
  it('CZK = finální cena, EUR/USD round(CZK / kurz)', () => {
    expect(shopPrices(12900, { EUR: 24.465, USD: 21.795 })).toEqual({ CZK: 12900, EUR: 527, USD: 592 });
  });
  it('nulový kurz se vynechá', () => expect(shopPrices(1000, { EUR: 0 })).toEqual({ CZK: 1000 }));
});

describe('buildDictionaries', () => {
  it('jen aktivní a jen klíče pro e-shop, EN fallback labelEn → label → value', () => {
    const d = buildDictionaries(options);
    expect(d.attrColor.map((o) => o.id)).toEqual([3, 4]);
    expect(d.attrColor[1]).toEqual({ id: 4, value: 'Olivová', cs: 'Olivová', en: 'Olivová', order: 1 });
    expect(d.pasShape[0].en).toBe('Drop');
    expect(Object.keys(d)).toEqual(['location', 'pasShape', 'attrColor', 'attrDamage']);
  });
});

describe('buildCatalogItem', () => {
  it('sestaví položku: sku, ceny, atributy jako id (bez ohledu na velikost písmen)', () => {
    const r = buildCatalogItem(base, ctx);
    expect('skip' in r).toBe(false);
    if ('skip' in r) return;
    expect(r.sku).toBe('K0006-0021');
    expect(r.state).toBe('available');
    expect(r.prices).toEqual({ CZK: 7900, EUR: 323, USD: 362 });
    expect(r.attrs).toEqual({ location: [1], pasShape: [2], attrColor: [3, 4], attrDamage: [5] });
    expect(r.weightG).toBe(8.6);
    expect(r.weightCt).toBe(43);
    expect(r.cert).toEqual({ hash: null, issuedAt: null });
    expect(r.photos).toEqual(['p3', 'p1']);
    expect(r.storage).toBe('R3 / 14');
  });
  it('rezervovaný kus', () => {
    const r = buildCatalogItem({ ...base, activeReservation: true }, ctx);
    expect('skip' in r ? null : r.state).toBe('reserved');
  });
  it('hodnota mimo číselník u povinného atributu → skipped unknown_attr', () => {
    expect(buildCatalogItem({ ...base, location: 'Neznámá' }, ctx)).toEqual({ skip: 'unknown_attr' });
  });
  it('neprodejný kus → skipped s důvodem', () => {
    expect(buildCatalogItem({ ...base, pricingStatus: 'NEEDS_REVIEW' }, ctx)).toEqual({ skip: 'pricing_needs_review' });
  });
  it('prodaný kus jde do katalogu se state sold i bez ceny (stránka prodaného kusu zůstává)', () => {
    const r = buildCatalogItem({ ...base, sold: true, soldAt: new Date('2026-10-03T00:00:00Z'), finalInternalPriceInclVatCzk: null, certHash: 'abc', certIssuedAt: new Date('2026-10-03T00:00:00Z') }, ctx);
    expect('skip' in r ? null : [r.state, r.cert.hash]).toEqual(['sold', 'abc']);
  });
  it('weightCt chybí → weight × 5', () => {
    const r = buildCatalogItem({ ...base, weightCt: '0' }, ctx);
    expect('skip' in r ? null : r.weightCt).toBe(43);
  });
});
