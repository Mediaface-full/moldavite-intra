import { describe, it, expect } from 'vitest';
import { parseEtsySettings } from '@/lib/etsy/settings';

const ok = { taxonomyId: 1234, shippingProfileId: '111', readinessStateId: '222', returnPolicyId: null, whoMade: 'someone_else', whenMade: 'before_2007', isSupply: false, tags: ['moldavite'], materials: ['moldavite'] };

describe('parseEtsySettings', () => {
  it('platné → objekt s BigInt id', () => {
    const r = parseEtsySettings(ok);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.shippingProfileId).toBe(BigInt(111));
      expect(r.taxonomyId).toBe(1234);
    }
  });
  it('14 štítků → chyba', () => {
    expect(parseEtsySettings({ ...ok, tags: Array.from({ length: 14 }, (_, i) => `t${i}`) })).toHaveProperty('error');
  });
  it('štítek 21 znaků → chyba', () => {
    expect(parseEtsySettings({ ...ok, tags: ['x'.repeat(21)] })).toHaveProperty('error');
  });
  it('neplatné whoMade → chyba', () => {
    expect(parseEtsySettings({ ...ok, whoMade: 'robot' })).toHaveProperty('error');
  });
  it('prázdné whenMade nebo nečíselné id → chyba', () => {
    expect(parseEtsySettings({ ...ok, whenMade: '' })).toHaveProperty('error');
    expect(parseEtsySettings({ ...ok, shippingProfileId: 'abc' })).toHaveProperty('error');
  });
  it('nevyplněné výběry (null) jsou povolené — listingy pak čekají na doplnění', () => {
    expect('error' in parseEtsySettings({ ...ok, taxonomyId: null, shippingProfileId: null, readinessStateId: null })).toBe(false);
  });
});
