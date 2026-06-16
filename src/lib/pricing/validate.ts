/**
 * Validace vstupu před přepočtem zakázky.
 * Vrátí seznam issues — UI / API endpoint je může zobrazit jako varování
 * bez nutnosti spouštět full výpočet.
 */
import { OrderPricingInput, PricingIssue } from './types';
import { toDecimalOrNull } from './decimal';
import { resolvePpg } from './resolve';

export function validateOrderForPricing(input: OrderPricingInput): PricingIssue[] {
  const issues: PricingIssue[] = [];

  for (const c of input.costs) {
    const amt = toDecimalOrNull(c.amountCzk);
    if (amt !== null && amt.isNegative()) {
      issues.push({
        severity: 'error',
        code: 'NEGATIVE_COST',
        message: `OrderCostItem id=${c.id} má zápornou hodnotu ${c.amountCzk}`,
      });
    }
  }

  if (input.stones.length === 0) {
    issues.push({ severity: 'warn', code: 'EMPTY_ORDER', message: 'Zakázka neobsahuje žádné kameny' });
  }

  for (const stone of input.stones) {
    const w = toDecimalOrNull(stone.weightGrams);
    if (w === null || !w.isPositive()) {
      issues.push({
        severity: 'warn',
        code: 'MISSING_WEIGHT',
        message: `Stone id=${stone.id}: chybí váha`,
      });
    }
    const ppg = resolvePpg(stone, input.order);
    if (ppg === null || !ppg.isPositive()) {
      issues.push({
        severity: 'warn',
        code: 'MISSING_PPG',
        message: `Stone id=${stone.id}: chybí cena za gram (na kameni ani na zakázce)`,
      });
    }
  }

  return issues;
}
