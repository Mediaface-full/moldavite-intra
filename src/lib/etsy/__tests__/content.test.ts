import { describe, it, expect } from 'vitest';
import { etsyTitle, etsyDescription, etsyTags, etsyPrice, etsyContentHash, DEFAULT_ETSY_TAGS } from '@/lib/etsy/content';

const item = { catalogNumber: 'K0001-0001', nameEn: '', descriptionEn: 'Short', longDescriptionEn: 'Long text.', weight: '5.68', pasShape: '' };

describe('etsyTitle', () => {
  it('fallback s katalogovým číslem a váhou', () => {
    const t = etsyTitle(item);
    expect(t).toContain('K0001-0001');
    expect(t).toContain('5.68 g');
  });
  it('max 140 znaků, ořez na celé slovo', () => {
    const t = etsyTitle({ ...item, nameEn: 'Moldavite '.repeat(20).trim() });
    expect(t.length).toBeLessThanOrEqual(140);
    expect(t.endsWith('Moldavite')).toBe(true);
  });
  it('nepovolené znaky pryč', () => {
    expect(etsyTitle({ ...item, nameEn: 'Moldavite ★ #1 <b>' })).toBe('Moldavite 1 b');
  });
});

describe('etsyDescription', () => {
  it('dlouhý popis, váha, certifikát s ověřením', () => {
    const d = etsyDescription(item, 'https://verify.bohemianmoldavite.com');
    expect(d).toContain('Long text.');
    expect(d).toContain('Weight: 5.68 g');
    expect(d).toContain('verify.bohemianmoldavite.com');
  });
});

describe('etsyTags', () => {
  it('max 13, každý ≤ 20 znaků, unikátní lowercase', () => {
    const input = [...Array.from({ length: 14 }, (_, i) => `tag${i}`), 'Tag1', 'x'.repeat(21)];
    const t = etsyTags(input, '');
    expect(t).toHaveLength(13);
    expect(t.every((x) => x.length <= 20 && x === x.toLowerCase())).toBe(true);
    expect(t.filter((x) => x === 'tag1')).toHaveLength(1);
    expect(t).not.toContain('x'.repeat(21));
  });
  it('výchozí sada = dnešní CSV + tvar', () => {
    expect(DEFAULT_ETSY_TAGS).toContain('czech moldavite');
    expect(etsyTags([], 'drop')).toEqual([...DEFAULT_ETSY_TAGS, 'drop']);
  });
});

describe('etsyPrice', () => {
  const cfg = { commissionPct: 20, roundingStep: 10 };
  it('EUR: 1000 Kč, +20 %, krok 10, kurz 24,47 → 49', () => {
    expect(etsyPrice('1000', cfg, 'EUR', { EUR: 24.47 })).toBe(49);
  });
  it('CZK → 1200', () => {
    expect(etsyPrice('1000', cfg, 'CZK', {})).toBe(1200);
  });
  it('chybějící kurz → null; nulová cena → null', () => {
    expect(etsyPrice('1000', cfg, 'USD', { EUR: 24.47 })).toBeNull();
    expect(etsyPrice('0', cfg, 'CZK', {})).toBeNull();
  });
});

describe('etsyContentHash', () => {
  const base = { title: 'T', description: 'D', tags: ['a'], materials: ['m'], price: 49, photoFiles: ['01.jpg', '04.jpg'], settingsVersion: 's1' };
  it('změna jedné fotky změní otisk', () => {
    expect(etsyContentHash(base)).not.toBe(etsyContentHash({ ...base, photoFiles: ['01.jpg', 'ai/04-aaaaaaaa.jpg'] }));
  });
  it('pořadí klíčů nehraje roli', () => {
    const { title, ...rest } = base;
    expect(etsyContentHash({ ...rest, title })).toBe(etsyContentHash(base));
  });
});

describe('CSV export a API dávají stejné štítky', () => {
  it('etsyTags(výchozí, tvar) = dosavadní vzorec CSV (baseTags + první část EN názvu tvaru)', async () => {
    const { PAS_SHAPES } = await import('@/lib/pasShapes');
    const s = PAS_SHAPES[0];
    const csv = [...DEFAULT_ETSY_TAGS, s.en.split('/')[0].trim().toLowerCase()].filter((t) => t.length <= 20);
    expect(etsyTags([], s.key)).toEqual(csv);
  });
});
