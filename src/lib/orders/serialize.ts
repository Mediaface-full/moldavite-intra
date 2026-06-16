/**
 * Serializace Order entit pro API odpovědi. Prisma vrací Decimal jako
 * Decimal.js objekt → API serializuje na string aby klient dostal stabilní
 * formát (sjednoceno se zbytkem projektu).
 */
import type { Order, OrderCostItem, Item, PricingConfig } from '@prisma/client';

type Decimalish = { toString(): string } | string | number | null | undefined;

function dec(v: Decimalish): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : v.toString();
}

export function serializeOrder(order: Order & { _count?: { items: number; costs: number } }) {
  return {
    ...order,
    totalPurchaseAmountSource: dec(order.totalPurchaseAmountSource),
    totalPurchaseAmountCzk: dec(order.totalPurchaseAmountCzk),
    declaredWeight: dec(order.declaredWeight),
    exchangeRate: dec(order.exchangeRate),
    defaultPurchasePricePerGramSource: dec(order.defaultPurchasePricePerGramSource),
    defaultPurchasePricePerGramCzk: dec(order.defaultPurchasePricePerGramCzk),
    vatRatePct: dec(order.vatRatePct),
  };
}

export function serializeCost(cost: OrderCostItem) {
  return {
    ...cost,
    amountSource: dec(cost.amountSource),
    amountCzk: dec(cost.amountCzk),
    exchangeRate: dec(cost.exchangeRate),
  };
}

export function serializeItemForPricing(item: Item) {
  return {
    ...item,
    purchasePrice: dec(item.purchasePrice),
    salePrice: dec(item.salePrice),
    priceEUR: dec(item.priceEUR),
    priceUSD: dec(item.priceUSD),
    weight: dec(item.weight),
    weightCt: dec(item.weightCt),
    purchasePricePerGramSource: dec(item.purchasePricePerGramSource),
    purchasePricePerGramCzk: dec(item.purchasePricePerGramCzk),
    allocatedOrderCostCzk: dec(item.allocatedOrderCostCzk),
    computedMarginRate: dec(item.computedMarginRate),
    computedMinPriceExVatCzk: dec(item.computedMinPriceExVatCzk),
    computedMinPriceInclVatCzk: dec(item.computedMinPriceInclVatCzk),
    recommendedPriceInclVatCzk: dec(item.recommendedPriceInclVatCzk),
    manualPriceInclVatCzk: dec(item.manualPriceInclVatCzk),
    finalInternalPriceInclVatCzk: dec(item.finalInternalPriceInclVatCzk),
  };
}

export function serializePricingConfig(cfg: PricingConfig) {
  return { ...cfg };
}
