/**
 * Capture audit snapshot pro jeden kámen v okamžiku prodeje.
 *
 * Volá se z PATCH /api/items/[id] při transition `sold: false → true`.
 * Spustí plný recalc Order (kvůli správné alokaci nákladů na všechny kameny)
 * a uloží do `Item.priceCalcSnapshot` JSON obsahující:
 *   - rules: aktuální PricingConfig pravidla použitá pro výpočet
 *   - stoneResult: per-stone breakdown (matched rules + margin breakdown + steps + status)
 *   - itemSnapshot: zafixované hodnoty Item v okamžiku prodeje (váha, ceny, atributy)
 *   - orderContext: code/název konfigurace pro lidský audit
 *
 * Po nastavení snapshot už se nikdy nemění — i kdyby user dal sold zpět na
 * false a znovu na true. Auditovatelnost = jednorázová fixace.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  calculateOrderPricing,
  type OrderPricingInput,
  type PricingConfigSnapshot,
  type StoneInput,
} from '@/lib/pricing';

export type ItemSaleSnapshot = {
  capturedAt: string;
  orderId: number | null;
  orderCode: string | null;
  pricingConfigId: number | null;
  pricingConfigName: string | null;
  rules: PricingConfigSnapshot;
  stoneResult: unknown; // StonePricingResult — JSON safe
  itemSnapshot: {
    weight: string | null;
    purchasePrice: string;
    salePrice: string;
    manualPriceInclVatCzk: string | null;
    purchasePricePerGramCzk: string | null;
    pasShape: string | null;
    attrDamage: string | null;
    attrColor: string[];
    attrCollectible: boolean;
  };
};

type TxClient = PrismaClient | Prisma.TransactionClient;

export async function captureItemSaleSnapshot(
  tx: TxClient,
  itemId: number,
  capturedAt: Date,
): Promise<ItemSaleSnapshot | null> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    include: {
      order: {
        include: {
          costs: true,
          pricingConfig: true,
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
        },
      },
    },
  });
  if (!item) return null;

  const order = item.order;

  // Pokud kámen nemá zakázku (legacy data) → zafixovat pouze itemSnapshot bez rules.
  if (!order) {
    return {
      capturedAt: capturedAt.toISOString(),
      orderId: null,
      orderCode: null,
      pricingConfigId: null,
      pricingConfigName: null,
      rules: { version: 1, missingValuePolicy: 'warn', rules: [] },
      stoneResult: null,
      itemSnapshot: serializeItemSnapshot(item),
    };
  }

  const rules: PricingConfigSnapshot = order.pricingConfig
    ? (order.pricingConfig.rules as unknown as PricingConfigSnapshot)
    : { version: 1, missingValuePolicy: 'warn', rules: [] };

  const input: OrderPricingInput = {
    order: {
      id: order.id,
      defaultPurchasePricePerGramCzk: order.defaultPurchasePricePerGramCzk?.toString() ?? null,
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
    config: rules,
  };

  const result = calculateOrderPricing(input);
  const stoneResult = result.perStone.find((s) => s.stoneId === itemId) ?? null;

  return {
    capturedAt: capturedAt.toISOString(),
    orderId: order.id,
    orderCode: order.code,
    pricingConfigId: order.pricingConfigId,
    pricingConfigName: order.pricingConfig?.name ?? null,
    rules,
    stoneResult,
    itemSnapshot: serializeItemSnapshot(item),
  };
}

function serializeItemSnapshot(item: {
  weight: Prisma.Decimal | null;
  purchasePrice: Prisma.Decimal;
  salePrice: Prisma.Decimal;
  manualPriceInclVatCzk: Prisma.Decimal | null;
  purchasePricePerGramCzk: Prisma.Decimal | null;
  pasShape: string;
  attrDamage: string;
  attrColor: string[];
  attrCollectible: boolean;
}): ItemSaleSnapshot['itemSnapshot'] {
  return {
    weight: item.weight ? item.weight.toString() : null,
    purchasePrice: item.purchasePrice.toString(),
    salePrice: item.salePrice.toString(),
    manualPriceInclVatCzk: item.manualPriceInclVatCzk?.toString() ?? null,
    purchasePricePerGramCzk: item.purchasePricePerGramCzk?.toString() ?? null,
    pasShape: item.pasShape || null,
    attrDamage: item.attrDamage || null,
    attrColor: item.attrColor,
    attrCollectible: item.attrCollectible,
  };
}
