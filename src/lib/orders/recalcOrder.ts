/**
 * Full Order pricing recalc — extrahováno z /api/orders/[id]/recalculate/route.ts
 * aby šlo volat z PATCH item endpoint (auto-recalc po změně atributu/váhy).
 *
 * Snapshot policy: DRAFT/PRICED/PUBLISHED vždy aktuální PricingConfig.rules.
 * CANCELLED/ARCHIVED použijí zafixovaný snapshot (historický audit).
 */
import { prisma } from '@/lib/prisma';
import { calculateOrderPricing } from '@/lib/pricing';
import type {
  OrderPricingInput,
  PricingConfigSnapshot,
  StoneInput,
} from '@/lib/pricing';

export async function recalcOrder(orderId: number): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      costs: true,
      items: {
        include: {
          box: {
            select: {
              purchasePricePerGramCzk: true,
              purchaseAmountCzk: true,
              declaredWeight: true,
            },
          },
        },
      },
      pricingConfig: true,
    },
  });
  if (!order) return;

  const isHistorical = order.status === 'CANCELLED' || order.status === 'ARCHIVED';
  let snapshot: PricingConfigSnapshot;
  if (isHistorical && order.pricingConfigSnapshot && isValidSnapshot(order.pricingConfigSnapshot)) {
    snapshot = order.pricingConfigSnapshot as unknown as PricingConfigSnapshot;
  } else if (order.pricingConfig) {
    snapshot = order.pricingConfig.rules as unknown as PricingConfigSnapshot;
  } else {
    snapshot = { version: 1, missingValuePolicy: 'warn', rules: [] };
  }

  const input: OrderPricingInput = {
    order: {
      id: order.id,
      defaultPurchasePricePerGramCzk: order.defaultPurchasePricePerGramCzk?.toString() ?? null,
      totalPurchaseAmountCzk: order.totalPurchaseAmountCzk?.toString() ?? null,
      declaredWeight: order.declaredWeight?.toString() ?? null,
      allocationMethod: order.allocationMethod,
      vatRatePct: order.vatRatePct.toString(),
      roundingStep: order.roundingStep,
    },
    stones: order.items.map<StoneInput>((it) => ({
      id: it.id,
      weightGrams: it.weight ? it.weight.toString() : null,
      purchasePricePerGramCzk: it.purchasePricePerGramCzk?.toString() ?? null,
      manualPriceInclVatCzk: it.manualPriceInclVatCzk?.toString() ?? null,
      attrs: {
        pasShape: it.pasShape || null,
        location: it.location || null,
        attrDamage: it.attrDamage || null,
        attrColor: it.attrColor ?? [],
        attrCollectible: it.attrCollectible,
      },
      box: {
        purchasePricePerGramCzk: it.box?.purchasePricePerGramCzk?.toString() ?? null,
        purchaseAmountCzk: it.box?.purchaseAmountCzk?.toString() ?? null,
        declaredWeight: it.box?.declaredWeight?.toString() ?? null,
      },
    })),
    costs: order.costs.map((c) => ({
      id: c.id,
      amountCzk: c.amountCzk.toString(),
      allocationMethodOverride: c.allocationMethodOverride,
    })),
    config: snapshot,
  };

  const result = calculateOrderPricing(input);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const r of result.perStone) {
      const newRecommended = r.steps?.recommendedPriceInclVatCzk
        ? Number(r.steps.recommendedPriceInclVatCzk)
        : 0;
      const shouldAutoFillSale = newRecommended > 0;
      const breakdown = r.steps
        ? {
            marginBreakdown: r.steps.marginBreakdown,
            totalMarginRate: r.steps.totalMarginRate,
          }
        : null;

      await tx.item.update({
        where: { id: r.stoneId },
        data: {
          ...(r.steps?.purchasePriceCzk ? { purchasePrice: r.steps.purchasePriceCzk } : {}),
          ...(shouldAutoFillSale && r.steps?.recommendedPriceInclVatCzk ? { salePrice: r.steps.recommendedPriceInclVatCzk } : {}),
          allocatedOrderCostCzk: r.steps?.allocatedOrderCostCzk ?? null,
          costBasisCzk: r.steps?.costBasisCzk ?? null,
          computedMarginRate: r.steps?.totalMarginRate ?? null,
          computedMinPriceExVatCzk: r.steps?.minPriceExVatCzk ?? null,
          computedMinPriceInclVatCzk: r.steps?.minPriceInclVatCzk ?? null,
          recommendedPriceInclVatCzk: r.steps?.recommendedPriceInclVatCzk ?? null,
          finalInternalPriceInclVatCzk: r.finalInternalPriceInclVatCzk,
          pricingStatus: r.status,
          priceCalcBreakdown: breakdown as never,
          lastCalculatedAt: now,
        },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        lastCalculatedAt: now,
        status: order.status === 'DRAFT' ? 'PRICED' : order.status,
      },
    });
  });
}

function isValidSnapshot(input: unknown): input is { version: number; missingValuePolicy: string; rules: unknown[] } {
  if (typeof input !== 'object' || input === null) return false;
  const i = input as Record<string, unknown>;
  return typeof i.version === 'number' && typeof i.missingValuePolicy === 'string' && Array.isArray(i.rules);
}
