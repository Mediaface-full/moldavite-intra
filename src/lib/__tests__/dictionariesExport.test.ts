import { describe, it, expect } from 'vitest';
import { buildDictionariesMarkdown, buildDictionariesJson, dictionariesExportFilename, type DictOption, type DictUsage } from '@/lib/dictionariesExport';

const opt = (attrKey: string, value: string, extra: Partial<DictOption> = {}): DictOption => ({
  attrKey, value, label: null, labelEn: null, sortOrder: 0, active: true, ...extra,
});

const options: DictOption[] = [
  opt('pasShape', 'Kapka', { sortOrder: 10 }),
  opt('pasShape', 'Disk', { sortOrder: 20, active: false }),
  opt('location', 'Ježkovna, Besednice', { sortOrder: 0, labelEn: 'Besednice' }),
  opt('location', 'Jiné', { sortOrder: 90 }),
  opt('attrColor', 'zelená'),
  opt('attrDamage', 'Bez poškození'),
  opt('cassetteType', 'Kameny'),
];

const usage: DictUsage = {
  pasShape: { Kapka: 3, DROP: 2, Disk: 1, Koule: 4 },   // DROP = legacy klíč Kapky; Koule = osiřelá
  location: { 'Ježkovna, Besednice': 5, 'Chlum nad Berounkou': 1 },
  attrColor: { zelená: 6 },
  attrDamage: { 'Bez poškození': 7 },
  cassetteType: { Kameny: 10 },
};

describe('buildDictionariesMarkdown', () => {
  const md = buildDictionariesMarkdown({ options, usage, generatedAt: new Date('2026-10-04T10:00:00Z') });

  it('má hlavičku s datem a sekce v pořadí', () => {
    expect(md).toContain('# Číselníky kamenů');
    expect(md).toContain('4. 10. 2026');
    const i = (s: string) => md.indexOf(s);
    expect(i('Tvar (PAS)')).toBeLessThan(i('Místo nálezu'));
    expect(i('Místo nálezu')).toBeLessThan(i('Barva'));
    expect(i('Barva')).toBeLessThan(i('Poškození / stav'));
    expect(i('Poškození / stav')).toBeLessThan(i('Typ kazety'));
  });

  it('tvar: EN + klíč + popisy z pasShapes, legacy klíč DROP se přičte ke Kapce', () => {
    expect(md).toMatch(/\| Kapka \| Drop \/ Teardrop \| `DROP` \| Klasický protáhlý[^|]*\| A classic elongated[^|]*\| ano \| 5 \|/);
    expect(md).toMatch(/\| Disk \| Disc \| `DISC` \|[^\n]*\| ne \| 1 \|/);
  });

  it('chybějící tvary z pasShapes vypíše (Tyčka, Činka, …), osiřelou Koule nahlásí', () => {
    expect(md).toContain('které v číselníku chybí');
    expect(md).toContain('**Tyčka** (Rod / Bar)');
    expect(md).toMatch(/Hodnoty mimo číselník[^\n]*Koule \(4\)/);
  });

  it('lokalita: labelEn, počty, osiřelá hodnota, hint na prázdné labelEn', () => {
    expect(md).toContain('| Ježkovna, Besednice | Besednice | ano | 5 |');
    expect(md).toContain('| Jiné |  | ano | 0 |');
    expect(md).toMatch(/Hodnoty mimo číselník[^\n]*Chlum nad Berounkou \(1\)/);
    expect(md).toContain('Prázdné `labelEn`');
  });

  it('typ kazety počítá kazety, odvozené sekce jsou přítomné', () => {
    expect(md).toContain('| Kameny |  | ano | 10 |');
    expect(md).toContain('Velikost — odvozená');
    expect(md).toContain('| ≥ 10 g | Velké | Large |');
    expect(md).toContain('| 10 – 20 g | 10–20 g | 10–20 g |');
    expect(md).toContain('Sbírkový kus');
    expect(md).toContain('/admin/attributes');
  });

  it('escapuje svislítko v hodnotě (nerozbije tabulku)', () => {
    const md2 = buildDictionariesMarkdown({ options: [opt('location', 'A | B')], usage: {}, generatedAt: new Date() });
    expect(md2).toContain('| A \\| B |');
  });
});

describe('buildDictionariesJson', () => {
  const j = buildDictionariesJson({ options, usage, generatedAt: new Date('2026-10-04T10:00:00Z') });

  it('seskupí podle attrKey, tvar má key/desc, usage sečtené', () => {
    const kapka = (j.dictionaries.pasShape as Array<Record<string, unknown>>).find((x) => x.value === 'Kapka')!;
    expect(kapka.key).toBe('DROP');
    expect(kapka.usage).toBe(5);
    expect(kapka.labelEn).toBe('Drop / Teardrop');
    expect(j.orphans.pasShape).toEqual([{ value: 'Koule', count: 4 }]);
    expect(j.orphans.location).toEqual([{ value: 'Chlum nad Berounkou', count: 1 }]);
    expect(j.derived.weightRange).toHaveLength(5);
  });
});

describe('dictionariesExportFilename', () => {
  it('datum v názvu', () => {
    expect(dictionariesExportFilename(new Date('2026-10-04T10:00:00Z'), 'md')).toBe('ciselniky-kamene-2026-10-04.md');
  });
});
