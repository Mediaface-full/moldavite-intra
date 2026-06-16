/**
 * Resolve PPG (cena za gram) — z Stone.ppg nebo fallback na Order.defaultPpg.
 */
import { OrderInput, StoneInput } from './types';
import { Decimal, toDecimalOrNull } from './decimal';

export function resolvePpg(stone: StoneInput, order: OrderInput): Decimal | null {
  return (
    toDecimalOrNull(stone.purchasePricePerGramCzk) ??
    toDecimalOrNull(order.defaultPurchasePricePerGramCzk)
  );
}
