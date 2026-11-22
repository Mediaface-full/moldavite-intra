import { describe, it, expect } from 'vitest';
import { desiredEtsyState } from '@/lib/etsy/state';

const now = new Date('2026-12-01T12:00:00Z');
const base = { onEtsy: true, sold: false, eligible: true, activeReservation: false, listingId: BigInt(5), inactiveSince: null as Date | null, now };
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('desiredEtsyState', () => {
  it('vše v pořádku → active', () => expect(desiredEtsyState(base)).toEqual({ state: 'active', blockedReason: null }));
  it('rezervace e-shopu → inactive/reservation', () => expect(desiredEtsyState({ ...base, activeReservation: true })).toEqual({ state: 'inactive', blockedReason: 'reservation' }));
  it('prodaný (i ručně) → inactive/sold', () => expect(desiredEtsyState({ ...base, sold: true, inactiveSince: days(2) })).toEqual({ state: 'inactive', blockedReason: 'sold' }));
  it('prodaný a 31 dní neaktivní → removed', () => expect(desiredEtsyState({ ...base, sold: true, inactiveSince: days(31) })).toEqual({ state: 'removed', blockedReason: 'sold' }));
  it('prodaný bez listingu → none', () => expect(desiredEtsyState({ ...base, sold: true, listingId: null })).toEqual({ state: 'none', blockedReason: 'sold' }));
  it('onEtsy vypnuto → inactive/off; bez listingu none', () => {
    expect(desiredEtsyState({ ...base, onEtsy: false })).toEqual({ state: 'inactive', blockedReason: 'off' });
    expect(desiredEtsyState({ ...base, onEtsy: false, listingId: null })).toEqual({ state: 'none', blockedReason: 'off' });
  });
  it('nezpůsobilý (bez ceny…) → inactive/ineligible; bez listingu none', () => {
    expect(desiredEtsyState({ ...base, eligible: false })).toEqual({ state: 'inactive', blockedReason: 'ineligible' });
    expect(desiredEtsyState({ ...base, eligible: false, listingId: null })).toEqual({ state: 'none', blockedReason: 'ineligible' });
  });
  it('rezervace bez listingu → none (nic nevytvářet)', () => expect(desiredEtsyState({ ...base, activeReservation: true, listingId: null })).toEqual({ state: 'none', blockedReason: 'reservation' }));
  it('nový kámen bez listingu → active (vytvořit)', () => expect(desiredEtsyState({ ...base, listingId: null })).toEqual({ state: 'active', blockedReason: null }));
});
