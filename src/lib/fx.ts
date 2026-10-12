/**
 * Čisté FX helpery (bez Prisma) — jeden výpočet EUR/USD pro detail, exporty i e-shop.
 *
 * Základ v CZK = `finalInternalPriceInclVatCzk` (max(doporučená, speciální) — to, co jde
 * na e-shop), `salePrice` jen jako legacy fallback (kámen bez cenotvorby). Do 12. 10. 2026
 * se uložené `priceEUR/USD` počítaly ze `salePrice`, kterou recalc plní doporučenou →
 * u kamene se speciální cenou chipy na detailu nesedily s e-shopem (ten počítá z finální).
 *
 * Kurz ČNB je „rate za quantity jednotek" (EUR/USD quantity 1, JPY 100) — dělit quantity,
 * stejně jako `lib/shop/catalog.ts`.
 */
export type FxRates = Record<string, { rate: number; quantity?: number }>;

export function czkBaseForFx(item: {
  finalInternalPriceInclVatCzk?: unknown;
  salePrice?: unknown;
}): number {
  const fin = Number(item.finalInternalPriceInclVatCzk ?? 0);
  if (Number.isFinite(fin) && fin > 0) return fin;
  const sale = Number(item.salePrice ?? 0);
  return Number.isFinite(sale) && sale > 0 ? sale : 0;
}

export function perUnitRate(rates: FxRates, code: string): number {
  const r = rates[code];
  if (!r) return 0;
  const q = r.quantity && r.quantity > 0 ? r.quantity : 1;
  const per = Number(r.rate) / q;
  return Number.isFinite(per) && per > 0 ? per : 0;
}

/** Celé EUR/USD z CZK základu; 0 když kurz chybí (stejné chování jako dřív). */
export function fxPrices(czk: number, rates: FxRates): { priceEUR: number; priceUSD: number } {
  const eur = perUnitRate(rates, 'EUR');
  const usd = perUnitRate(rates, 'USD');
  return {
    priceEUR: czk > 0 && eur > 0 ? Math.round(czk / eur) : 0,
    priceUSD: czk > 0 && usd > 0 ? Math.round(czk / usd) : 0,
  };
}
