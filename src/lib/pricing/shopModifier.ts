/**
 * Modifikátor ceny pro shop/Etsy/další kanály.
 *
 * Aplikuje se až NA `finalInternalPriceInclVatCzk` (interní pravdu o ceně),
 * ne na surovou `salePrice`. Zachovává původní logiku (commission + rounding),
 * jen ji centralizuje do čisté funkce. Etapa 4 přepojí export endpointy
 * na tuto funkci.
 */
import { Decimal, moneyString, toDecimal } from './decimal';
import { ceilToStep } from './rounding';

export type ShopModifierConfig = {
  /** Provize v % (10 = +10%). 0 = bez markup. */
  commissionPct: string | number;
  /** Krok zaokrouhlení v Kč; 0/null = bez zaokrouhlení. */
  roundingStep: number | null;
};

/**
 * applyShopModifier(internal, { commissionPct: 10, roundingStep: 10 })
 *   internal = 1000  →  result = 1100   (+10%)
 *   internal = 1037  →  result = 1140   (+10% = 1140.7 → ceil to 10)
 */
export function applyShopModifier(internal: Decimal, cfg: ShopModifierConfig): Decimal {
  const commission = toDecimal(cfg.commissionPct);
  if (commission.isNegative()) {
    throw new Error(`applyShopModifier: záporná provize není povolena (${commission})`);
  }
  let p = internal.times(new Decimal(1).plus(commission.div(100)));
  if (cfg.roundingStep && cfg.roundingStep > 0) {
    p = ceilToStep(p, cfg.roundingStep);
  }
  return p;
}

/** Convenience wrapper pro stringové vstupy/výstupy. */
export function applyShopModifierToString(internal: string, cfg: ShopModifierConfig): string {
  return moneyString(applyShopModifier(toDecimal(internal), cfg));
}
