/**
 * Alokace nákladů zakázky mezi kameny.
 *
 * Tři metody: BY_WEIGHT (default), BY_PURCHASE_PRICE, EQUAL_PER_PIECE.
 * Per-cost-item override umožňuje různé metody pro různé náklady
 * (doprava BY_WEIGHT, clo BY_PURCHASE_PRICE, balné EQUAL_PER_PIECE).
 *
 * INVARIANT: součet alokovaných částek (po zaokrouhlení na haléře = 2dp)
 * MUSÍ přesně sedět na celkové sumě nákladů. Residuální haléře (artefakt
 * dělení s necelými poměry) se přidělí deterministicky kamenům s největším
 * zbytkem v desetinné části (largest-remainder method). Tie-breaker: nižší
 * stoneId. Stejný vstup → stejný výstup.
 *
 * Algoritmus per náklad:
 *   1. Spočítej "raw share" každého stone v plné decimal.js přesnosti
 *   2. Floor na haléře (2 desetinná místa)
 *   3. Zbytek (= total - sum(floored)) rozděl po 0.01 Kč kamenům
 *      seřazeným podle (largest fractional remainder DESC, stoneId ASC)
 */
import { AllocationMethod, OrderCostInput, StoneInput } from './types';
import { Decimal, toDecimal, toDecimalOrNull } from './decimal';

export type AllocationResult = {
  /** Map<stoneId, total allocated in CZK (2dp, sums exactly to totalCostsCzk)> */
  perStone: Map<number, Decimal>;
  /** Sum of all costs in CZK (invariant: equals sum(perStone.values)) */
  totalCostsCzk: Decimal;
  /** Stones eligible for allocation (have weight > 0 AND ppg resolvable) */
  eligibleStoneIds: Set<number>;
};

export type AllocationContext = {
  /** Resolvovaná PPG (z stone.ppg nebo order.defaultPpg) — nutná pro BY_PURCHASE_PRICE */
  resolvedPpgByStoneId: Map<number, Decimal | null>;
};

/**
 * Hlavní alokační funkce. Iteruje přes náklady, každý alokuje podle své metody
 * (override) nebo defaultní `orderMethod`, výsledky sčítá per-stone.
 */
export function allocateCosts(
  costs: OrderCostInput[],
  stones: StoneInput[],
  orderMethod: AllocationMethod,
  ctx: AllocationContext
): AllocationResult {
  const perStone = new Map<number, Decimal>();
  for (const s of stones) perStone.set(s.id, new Decimal(0));

  const eligibleStoneIds = computeEligibleStones(stones, ctx);
  let totalCostsCzk = new Decimal(0);

  for (const cost of costs) {
    const amount = toDecimal(cost.amountCzk);
    totalCostsCzk = totalCostsCzk.plus(amount);

    if (amount.isZero()) continue; // nic k alokaci

    const method = cost.allocationMethodOverride ?? orderMethod;
    const distribution = distributeSingleCost(amount, stones, eligibleStoneIds, method, ctx);

    for (const [stoneId, amt] of distribution.entries()) {
      perStone.set(stoneId, (perStone.get(stoneId) ?? new Decimal(0)).plus(amt));
    }
  }

  return { perStone, totalCostsCzk, eligibleStoneIds };
}

/**
 * Rozdistribuuje jeden náklad mezi způsobilé kameny.
 * Output je už zaokrouhlený na 2dp s deterministickým residuálem (součet = amount).
 */
function distributeSingleCost(
  amount: Decimal,
  stones: StoneInput[],
  eligibleStoneIds: Set<number>,
  method: AllocationMethod,
  ctx: AllocationContext
): Map<number, Decimal> {
  const result = new Map<number, Decimal>();
  for (const s of stones) result.set(s.id, new Decimal(0));

  const eligible = stones.filter((s) => eligibleStoneIds.has(s.id));
  if (eligible.length === 0) return result; // nelze alokovat, vrátíme 0

  // 1. raw share v plné přesnosti
  const rawShares = new Map<number, Decimal>();
  if (method === 'EQUAL_PER_PIECE') {
    const share = amount.div(eligible.length);
    for (const s of eligible) rawShares.set(s.id, share);
  } else {
    const denominator = computeDenominator(eligible, method, ctx);
    if (denominator.isZero() || denominator.isNegative()) {
      // edge case: BY_WEIGHT s totálně nulovými váhami u všech způsobilých.
      // Fallback na EQUAL_PER_PIECE aby se nestratil náklad.
      const share = amount.div(eligible.length);
      for (const s of eligible) rawShares.set(s.id, share);
    } else {
      for (const s of eligible) {
        const basis = computeBasis(s, method, ctx);
        rawShares.set(s.id, basis.div(denominator).times(amount));
      }
    }
  }

  // 2. floor na haléře + spočítat zbytek
  const floored = new Map<number, Decimal>();
  const fractionalRemainders: Array<{ stoneId: number; remainder: Decimal }> = [];
  let flooredSum = new Decimal(0);

  for (const [stoneId, raw] of rawShares.entries()) {
    const f = raw.toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    floored.set(stoneId, f);
    flooredSum = flooredSum.plus(f);
    const remainder = raw.minus(f).times(100); // 0..1 → 0..100 (haléře)
    fractionalRemainders.push({ stoneId, remainder });
  }

  // 3. residuum = amount - flooredSum (počet haléřů k rozdělení)
  const residualCzk = amount.minus(flooredSum);
  const residualHellers = residualCzk.times(100).round().toNumber();

  // 4. seřaď podle (largest remainder DESC, stoneId ASC) a přidej 0.01 prvním N
  fractionalRemainders.sort((a, b) => {
    const cmp = b.remainder.comparedTo(a.remainder);
    if (cmp !== 0) return cmp;
    return a.stoneId - b.stoneId;
  });

  for (let i = 0; i < residualHellers && i < fractionalRemainders.length; i++) {
    const { stoneId } = fractionalRemainders[i];
    floored.set(stoneId, (floored.get(stoneId) ?? new Decimal(0)).plus('0.01'));
  }

  // 5. vrátit jen způsobilé (nezpůsobilé mají result = 0 už z inicializace)
  for (const [stoneId, amt] of floored.entries()) {
    result.set(stoneId, amt);
  }
  return result;
}

/** Způsobilý kámen = má weight > 0 A resolvable PPG > 0. */
function computeEligibleStones(stones: StoneInput[], ctx: AllocationContext): Set<number> {
  const set = new Set<number>();
  for (const s of stones) {
    const w = toDecimalOrNull(s.weightGrams);
    const ppg = ctx.resolvedPpgByStoneId.get(s.id) ?? null;
    if (w !== null && w.gt(0) && ppg !== null && ppg.gt(0)) {
      set.add(s.id);
    }
  }
  return set;
}

function computeBasis(
  stone: StoneInput,
  method: AllocationMethod,
  ctx: AllocationContext
): Decimal {
  if (method === 'BY_WEIGHT') {
    return toDecimal(stone.weightGrams);
  }
  if (method === 'BY_PURCHASE_PRICE') {
    const w = toDecimal(stone.weightGrams);
    const ppg = ctx.resolvedPpgByStoneId.get(stone.id) ?? new Decimal(0);
    return w.times(ppg);
  }
  // EQUAL_PER_PIECE — basis = 1, denominator = N (handled výše)
  return new Decimal(1);
}

function computeDenominator(
  stones: StoneInput[],
  method: AllocationMethod,
  ctx: AllocationContext
): Decimal {
  let sum = new Decimal(0);
  for (const s of stones) {
    sum = sum.plus(computeBasis(s, method, ctx));
  }
  return sum;
}
