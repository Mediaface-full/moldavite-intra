import { Decimal } from './decimal';

/**
 * Přidá DPH k netto ceně. vatRatePct = 21.00 znamená 21%.
 * addVat(1000, 21) === 1210
 */
export function addVat(netto: Decimal, vatRatePct: Decimal): Decimal {
  if (vatRatePct.isNegative()) {
    throw new Error(`addVat: vatRatePct nemůže být záporné (${vatRatePct})`);
  }
  return netto.times(new Decimal(1).plus(vatRatePct.div(100)));
}

/**
 * Odečte DPH z brutto ceny.
 * removeVat(1210, 21) === 1000
 */
export function removeVat(brutto: Decimal, vatRatePct: Decimal): Decimal {
  if (vatRatePct.isNegative()) {
    throw new Error(`removeVat: vatRatePct nemůže být záporné (${vatRatePct})`);
  }
  return brutto.div(new Decimal(1).plus(vatRatePct.div(100)));
}
