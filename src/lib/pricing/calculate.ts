/**
 * Hlavní orchestrace výpočtu cen pro celou zakázku.
 *
 * Cesta výpočtu:
 *   1. Pro každý stone: resolve PPG → spočítej eligibility
 *   2. Pro každý cost: spočítej alokaci podle vlastní (nebo defaultní) metody
 *      → součet alokací per stone v 2dp přesnosti (largest-remainder residual)
 *   3. Pro každý stone:
 *      - purchasePrice = weight × ppg
 *      - allocatedCost (z kroku 2)
 *      - costBasis = purchase + allocated
 *      - marginRate = resolveMargin(stone, config)
 *      - marginAmount = costBasis × marginRate
 *      - minPriceExVat = costBasis + marginAmount
 *      - minPriceInclVat = exVat × (1 + vat/100)
 *      - recommendedPriceInclVat = ceilToStep(inclVat, step)
 *      - finalInternal = MAX(recommended, manual ?? recommended)
 *   4. Status:
 *      - NEEDS_INPUT — chybí weight nebo PPG nebo error-policy issue v marži
 *      - NEEDS_REVIEW — manualPrice < recommendedPrice
 *      - OK — vše v pořádku
 *
 * INVARIANT: sum(perStone.allocatedOrderCostCzk) === sum(costs.amountCzk)
 * (přes všechny způsobilé kameny; pro nezpůsobilé je alokace 0).
 */
import {
  OrderPricingInput,
  OrderPricingResult,
  StonePricingResult,
  StonePricingSteps,
  PricingIssue,
  PricingStatus,
  StoneInput,
} from './types';
import { Decimal, moneyString, moneyStringOrNull, rateString, toDecimalOrNull } from './decimal';
import { resolvePpg } from './resolve';
import { allocateCosts } from './allocation';
import { resolveMargin } from './margin';
import { addVat } from './vat';
import { ceilToStep } from './rounding';

export function calculateOrderPricing(input: OrderPricingInput): OrderPricingResult {
  const { order, stones, costs, config } = input;
  const warnings: OrderPricingResult['warnings'] = [];

  // Validace nákladů — žádný záporný náklad (validation error, ne tichý průchod)
  for (const c of costs) {
    const amt = toDecimalOrNull(c.amountCzk);
    if (amt !== null && amt.isNegative()) {
      warnings.push({
        code: 'NEGATIVE_COST',
        message: `OrderCostItem id=${c.id} má zápornou hodnotu ${c.amountCzk} — bude ignorován`,
      });
    }
  }
  const validCosts = costs.filter((c) => {
    const amt = toDecimalOrNull(c.amountCzk);
    return amt !== null && !amt.isNegative();
  });

  // Prázdná zakázka
  if (stones.length === 0) {
    warnings.push({ code: 'EMPTY_ORDER', message: 'Zakázka neobsahuje žádné kameny' });
    return {
      perStone: [],
      summary: {
        totalPurchaseCostCzk: moneyString(new Decimal(0)),
        totalAllocatedCostsCzk: moneyString(sumCosts(validCosts)),
        totalRecommendedPriceInclVatCzk: moneyString(new Decimal(0)),
        stonesNeedingInput: 0,
        stonesNeedingReview: 0,
        stonesOk: 0,
      },
      warnings,
    };
  }

  // Resolve PPG pro každý kámen (může vrátit null pokud chybí)
  const resolvedPpgByStoneId = new Map<number, Decimal | null>();
  for (const s of stones) {
    resolvedPpgByStoneId.set(s.id, resolvePpg(s, order));
  }

  // Alokace nákladů
  const allocation = allocateCosts(validCosts, stones, order.allocationMethod, {
    resolvedPpgByStoneId,
  });

  const vatRatePct = new Decimal(order.vatRatePct);

  // Per-stone výpočet
  const perStone: StonePricingResult[] = [];
  let totalPurchase = new Decimal(0);
  let totalRecommended = new Decimal(0);
  let counts = { needsInput: 0, needsReview: 0, ok: 0 };

  for (const stone of stones) {
    const result = computeStone(stone, order, vatRatePct, allocation.perStone.get(stone.id) ?? new Decimal(0), config, resolvedPpgByStoneId);
    perStone.push(result);

    if (result.steps !== null) {
      totalPurchase = totalPurchase.plus(new Decimal(result.steps.purchasePriceCzk));
    }
    if (result.finalInternalPriceInclVatCzk !== null) {
      totalRecommended = totalRecommended.plus(new Decimal(result.finalInternalPriceInclVatCzk));
    }

    if (result.status === 'NEEDS_INPUT') counts.needsInput++;
    else if (result.status === 'NEEDS_REVIEW') counts.needsReview++;
    else if (result.status === 'OK') counts.ok++;
  }

  return {
    perStone,
    summary: {
      totalPurchaseCostCzk: moneyString(totalPurchase),
      totalAllocatedCostsCzk: moneyString(allocation.totalCostsCzk),
      totalRecommendedPriceInclVatCzk: moneyString(totalRecommended),
      stonesNeedingInput: counts.needsInput,
      stonesNeedingReview: counts.needsReview,
      stonesOk: counts.ok,
    },
    warnings,
  };
}

function computeStone(
  stone: StoneInput,
  order: OrderPricingInput['order'],
  vatRatePct: Decimal,
  allocatedCost: Decimal,
  config: OrderPricingInput['config'],
  resolvedPpgByStoneId: Map<number, Decimal | null>
): StonePricingResult {
  const issues: PricingIssue[] = [];
  const weight = toDecimalOrNull(stone.weightGrams);
  const ppg = resolvedPpgByStoneId.get(stone.id) ?? null;
  const manual = toDecimalOrNull(stone.manualPriceInclVatCzk);

  // NEEDS_INPUT — chybí váha nebo PPG
  if (weight === null || !weight.gt(0)) {
    issues.push({
      severity: 'error',
      code: 'MISSING_WEIGHT',
      message: 'Kámen nemá zadanou váhu — cenu nelze spočítat',
    });
  }
  if (ppg === null || !ppg.gt(0)) {
    issues.push({
      severity: 'error',
      code: 'MISSING_PPG',
      message: 'Chybí cena za gram (na kameni ani na zakázce)',
    });
  }

  if (weight === null || !weight.gt(0) || ppg === null || !ppg.gt(0)) {
    return {
      stoneId: stone.id,
      steps: null,
      manualPriceInclVatCzk: moneyStringOrNull(manual),
      finalInternalPriceInclVatCzk: null,
      status: 'NEEDS_INPUT',
      issues,
    };
  }

  // Marže
  const marginResult = resolveMargin(stone, config);
  issues.push(...marginResult.issues);

  const hasMarginError = marginResult.issues.some((i) => i.severity === 'error');

  // Výpočet
  // POZOR: marže se aplikuje JEN na purchasePrice (ne na costBasis).
  // Společné zakázkové náklady jsou fixní položka — marže reflektuje
  // exkluzivitu kamene podle jeho atributů a nákupní ceny.
  //   minPriceExVat = purchase × (1 + marginRate) + allocatedCost
  const purchasePrice = weight.times(ppg);
  const marginAmount = purchasePrice.times(marginResult.totalRate);
  const costBasis = purchasePrice.plus(allocatedCost); // informativní (purchase + allocated)
  let minPriceExVat = purchasePrice.plus(marginAmount).plus(allocatedCost);

  // Záporná cena clamp na 0 (záporná marže silnější než cost basis)
  if (minPriceExVat.isNegative()) {
    issues.push({
      severity: 'warn',
      code: 'NEGATIVE_PRICE_CLAMPED',
      message: `Marže (${rateString(marginResult.totalRate)}) stáhla cenu pod 0 — clamp na 0`,
    });
    minPriceExVat = new Decimal(0);
  }

  const minPriceInclVat = addVat(minPriceExVat, vatRatePct);
  const recommendedPriceInclVat = ceilToStep(minPriceInclVat, order.roundingStep);

  // Final internal price = MAX(recommended, manual ?? recommended)
  let finalInternal: Decimal;
  let status: PricingStatus = 'OK';

  if (manual === null) {
    finalInternal = recommendedPriceInclVat;
  } else if (manual.gte(recommendedPriceInclVat)) {
    finalInternal = manual;
  } else {
    // Manual cena spadla pod recommended → NEEDS_REVIEW
    issues.push({
      severity: 'warn',
      code: 'MANUAL_BELOW_MIN',
      message: `Speciální cena ${moneyString(manual)} je pod doporučeným minimem ${moneyString(recommendedPriceInclVat)}`,
    });
    finalInternal = recommendedPriceInclVat; // bezpečně použij doporučenou
    status = 'NEEDS_REVIEW';
  }

  if (hasMarginError && status === 'OK') {
    status = 'NEEDS_INPUT';
  }

  const steps: StonePricingSteps = {
    weightGrams: weight.toFixed(2),
    purchasePricePerGramCzk: moneyString(ppg),
    purchasePriceCzk: moneyString(purchasePrice),
    allocatedOrderCostCzk: moneyString(allocatedCost),
    costBasisCzk: moneyString(costBasis),
    marginBreakdown: marginResult.breakdown.map((b) => ({
      ruleKey: b.ruleKey,
      matched: b.matched,
      marginRate: rateString(b.marginRate),
    })),
    totalMarginRate: rateString(marginResult.totalRate),
    marginAmountCzk: moneyString(marginAmount),
    minPriceExVatCzk: moneyString(minPriceExVat),
    vatRatePct: vatRatePct.toFixed(2),
    minPriceInclVatCzk: moneyString(minPriceInclVat),
    roundingStep: order.roundingStep,
    recommendedPriceInclVatCzk: moneyString(recommendedPriceInclVat),
  };

  return {
    stoneId: stone.id,
    steps,
    manualPriceInclVatCzk: moneyStringOrNull(manual),
    finalInternalPriceInclVatCzk: moneyString(finalInternal),
    status,
    issues,
  };
}

function sumCosts(costs: OrderPricingInput['costs']): Decimal {
  let sum = new Decimal(0);
  for (const c of costs) {
    const a = toDecimalOrNull(c.amountCzk);
    if (a !== null) sum = sum.plus(a);
  }
  return sum;
}
