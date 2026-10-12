import { describe, it, expect } from 'vitest';
import { computeReadiness, type ReadinessInput } from '@/lib/itemReadiness';

const full: ReadinessInput = {
  name: 'Vltavín Besednice 5,7 g',
  description: 'krátký', descriptionEn: 'short',
  longDescription: '<p>dlouhý</p>', longDescriptionEn: '<p>long</p>',
  pasShape: 'Kapka', attrDamage: 'Bez poškození', attrColor: ['zelená'], location: 'Besednice', weight: '5.68',
  pricingStatus: 'OK', onShop: true, onEtsy: true, certHash: 'a1b2c3d4e5f6a7b8',
  media: { photoCount: 24, has360: true, hasVideo: true, hasFilm: true },
};

describe('computeReadiness', () => {
  it('kompletní kámen → 13/13 (video je volitelné, nepočítá se)', () => {
    const r = computeReadiness(full);
    expect(r.total).toBe(13);
    expect(r.score).toBe(13);
    expect(r.items.every((x) => x.ok)).toBe(true);
    expect(r.items.find((x) => x.key === 'video')?.optional).toBe(true);
  });

  it('chybějící video nesnižuje skóre, v seznamu ale zůstává', () => {
    const r = computeReadiness({ ...full, media: { ...full.media, hasVideo: false } });
    expect(r.score).toBe(13);
    expect(r.total).toBe(13);
    expect(r.items.find((x) => x.key === 'video')?.ok).toBe(false);
  });

  it('prázdný kámen → 0/14, atributy vyjmenují co chybí', () => {
    const r = computeReadiness({
      ...full, name: '', description: '', descriptionEn: '', longDescription: '', longDescriptionEn: '',
      pasShape: '', attrDamage: '', attrColor: [], location: '', weight: '',
      pricingStatus: 'NEEDS_INPUT', onShop: false, onEtsy: false, certHash: '',
      media: { photoCount: 0, has360: false, hasVideo: false, hasFilm: false },
    });
    expect(r.score).toBe(0);
    expect(r.items.find((x) => x.key === 'attrs')?.detail).toBe('chybí tvar, poškození, barva, místo nálezu, hmotnost');
    expect(r.items.find((x) => x.key === 'photos')?.detail).toBe('žádné');
  });

  it('HTML-only dlouhý popis (<p></p>) se nepočítá jako vyplněný', () => {
    const r = computeReadiness({ ...full, longDescription: '<p></p>' });
    expect(r.items.find((x) => x.key === 'longCz')?.ok).toBe(false);
  });

  it('STALE cena → ✗ s hintem přepočítat; 12 fotek → 360° ✗ 12/24', () => {
    const r = computeReadiness({ ...full, pricingStatus: 'STALE', media: { ...full.media, photoCount: 12, has360: false } });
    expect(r.items.find((x) => x.key === 'price')).toMatchObject({ ok: false, detail: 'zastaralá — přepočítat' });
    expect(r.items.find((x) => x.key === 'photos360')).toMatchObject({ ok: false, detail: '12/24' });
  });

  it('hmotnost s českou čárkou je platná', () => {
    const r = computeReadiness({ ...full, weight: '3,45' });
    expect(r.items.find((x) => x.key === 'attrs')?.ok).toBe(true);
  });
});
