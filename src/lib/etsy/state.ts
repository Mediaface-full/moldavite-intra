/**
 * Požadovaný stav listingu na Etsy — jádro pojistky proti dvojímu prodeji (spec, tabulka „Pojistka“).
 * Pořadí pravidel = priorita: prodáno > vypnuto > nezpůsobilé > rezervace e-shopu > aktivní.
 * Bez existujícího listingu se nikdy nic nevytváří, jen když má být aktivní.
 */
export type EtsyDesired = 'active' | 'inactive' | 'removed' | 'none';
export type EtsyBlockedReason = 'reservation' | 'sold' | 'off' | 'ineligible' | null;

export const REMOVE_AFTER_DAYS = 30;

export function desiredEtsyState(input: {
  onEtsy: boolean; sold: boolean; eligible: boolean; activeReservation: boolean;
  listingId: bigint | null; inactiveSince: Date | null; now: Date;
}): { state: EtsyDesired; blockedReason: EtsyBlockedReason } {
  const hasListing = input.listingId !== null;
  const off = (blockedReason: Exclude<EtsyBlockedReason, null>) => ({ state: (hasListing ? 'inactive' : 'none') as EtsyDesired, blockedReason });
  if (input.sold) {
    if (hasListing && input.inactiveSince && input.now.getTime() - input.inactiveSince.getTime() > REMOVE_AFTER_DAYS * 86_400_000) {
      return { state: 'removed', blockedReason: 'sold' };
    }
    return off('sold');
  }
  if (!input.onEtsy) return off('off');
  if (!input.eligible) return off('ineligible');
  if (input.activeReservation) return off('reservation');
  return { state: 'active', blockedReason: null };
}

/**
 * Smazání kamene/kazety: listing, který se na Etsy může prodat (aktivní, koncept, neznámý stav po chybě),
 * mazání blokuje — jinak by po smazání zůstal v prodeji bez vazby na kámen (review I4).
 */
export function listingBlocksDelete(l: { listingId: bigint | null; state: string } | null): boolean {
  if (!l?.listingId) return false;
  return !['inactive', 'sold_out', 'expired', 'removed', 'none'].includes(l.state);
}
