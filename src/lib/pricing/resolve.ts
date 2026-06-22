/**
 * Resolve PPG (cena za gram) — fallback řetězec od nejvíc specifického
 * k nejvíc obecnému:
 *
 *  1. Item.purchasePricePerGramCzk    (per kámen override — výjimečné kameny)
 *  2. Box.purchasePricePerGramCzk     (per kazeta override — různí dodavatelé)
 *  3. Box.purchaseAmountCzk / Box.declaredWeight  (dopočet z nákupní ceny kazety)
 *  4. Order.defaultPurchasePricePerGramCzk        (per zakázka explicit default)
 *  5. Order.totalPurchaseAmountCzk / Order.declaredWeight  (dopočet z Order totals)
 *
 * Pokud žádná z úrovní není dostupná → null → kámen půjde do NEEDS_INPUT.
 *
 * Per-Box cenotvorba (Etapa po Q1-Q8): pro zakázky s kazetami od různých
 * dodavatelů s různými Kč/g, smícháním všeho na úrovni zakázky by se ceny
 * zkreslily. Tento fallback umožňuje Gideonovi zachovat cenovou identitu
 * kazety i jednotlivého výjimečného kamene.
 *
 * Úroveň 5 přidána 22. 6. 2026 — Gideon zadal Order totalPurchase + declaredWeight
 * (= deklarovaná cena za gram dopočtená v UI), ale fallback chain to ignoroval
 * kamenům v kazetách bez explicit PPG → kameny NEEDS_INPUT zbytečně.
 */
import { OrderInput, StoneInput } from './types';
import { Decimal, toDecimalOrNull } from './decimal';

export function resolvePpg(stone: StoneInput, order: OrderInput): Decimal | null {
  // 1. Per kámen
  const itemPpg = toDecimalOrNull(stone.purchasePricePerGramCzk);
  if (itemPpg !== null && itemPpg.gt(0)) return itemPpg;

  // 2. Per kazeta explicitní
  const boxPpg = toDecimalOrNull(stone.box?.purchasePricePerGramCzk ?? null);
  if (boxPpg !== null && boxPpg.gt(0)) return boxPpg;

  // 3. Per kazeta dopočítaný z amount / weight
  const boxAmount = toDecimalOrNull(stone.box?.purchaseAmountCzk ?? null);
  const boxWeight = toDecimalOrNull(stone.box?.declaredWeight ?? null);
  if (boxAmount !== null && boxAmount.gt(0) && boxWeight !== null && boxWeight.gt(0)) {
    return boxAmount.div(boxWeight);
  }

  // 4. Per zakázka explicit default
  const orderPpg = toDecimalOrNull(order.defaultPurchasePricePerGramCzk);
  if (orderPpg !== null && orderPpg.gt(0)) return orderPpg;

  // 5. Per zakázka dopočet z totalPurchase / declaredWeight
  const orderAmount = toDecimalOrNull(order.totalPurchaseAmountCzk ?? null);
  const orderWeight = toDecimalOrNull(order.declaredWeight ?? null);
  if (orderAmount !== null && orderAmount.gt(0) && orderWeight !== null && orderWeight.gt(0)) {
    return orderAmount.div(orderWeight);
  }

  return null;
}
