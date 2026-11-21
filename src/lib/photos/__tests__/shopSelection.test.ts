import { describe, it, expect } from 'vitest';
import { autoShopSlots, parseShopPhotos, resolveShopSlots } from '@/lib/photos/shopSelection';

const ALL = Array.from({ length: 24 }, (_, i) => i + 1);

describe('autoShopSlots', () => {
  it('celá otočka, hlavní 1 → čelo, 45°, profil, záda', () => {
    expect(autoShopSlots(ALL, 1)).toEqual([1, 4, 7, 13]);
  });
  it('posun přes konec kruhu (hlavní 20)', () => {
    expect(autoShopSlots(ALL, 20)).toEqual([20, 23, 2, 8]);
  });
  it('chybějící slot → nejbližší existující', () => {
    const avail = ALL.filter((n) => n !== 7 && n !== 13);
    const r = autoShopSlots(avail, 1);
    expect(r[0]).toBe(1);
    expect(r).toHaveLength(4);
    expect(new Set(r).size).toBe(4);
    expect(r).toContain(4);
    expect([6, 8]).toContain(r[2]);
    expect([12, 14]).toContain(r[3]);
  });
  it('málo fotek (ruční upload) → hlavní + pořadí', () => {
    expect(autoShopSlots([1, 2, 3], 2)).toEqual([2, 1, 3]);
    expect(autoShopSlots([1, 2, 3, 4, 5], 9)).toEqual([1, 2, 3, 4]);
  });
  it('nic → nic', () => {
    expect(autoShopSlots([], 1)).toEqual([]);
  });
});

describe('parseShopPhotos', () => {
  it('platné', () => { expect(parseShopPhotos([1, 7, 13])).toEqual([1, 7, 13]); expect(parseShopPhotos([])).toEqual([]); });
  it('neplatné', () => {
    for (const bad of [null, 'x', [0], [25], [1.5], [1, 1], [1, 2, 3, 4, 5], ['1']]) expect(parseShopPhotos(bad)).toBeNull();
  });
});

describe('resolveShopSlots', () => {
  it('bez ručního výběru → auto', () => {
    expect(resolveShopSlots(ALL, 1, [])).toEqual({ slots: [1, 4, 7, 13], auto: true });
  });
  it('ruční výběr, hlavní vždy první', () => {
    expect(resolveShopSlots(ALL, 5, [10, 5, 20])).toEqual({ slots: [5, 10, 20], auto: false });
    expect(resolveShopSlots(ALL, 5, [10, 15, 20, 22])).toEqual({ slots: [5, 10, 15, 20], auto: false });
  });
  it('ruční sloty, které na disku nejsou, se ignorují', () => {
    expect(resolveShopSlots([1, 2, 3], 1, [3, 9])).toEqual({ slots: [1, 3], auto: false });
    expect(resolveShopSlots([1, 2, 3], 1, [9])).toEqual({ slots: [1, 2, 3], auto: true });
  });
});
