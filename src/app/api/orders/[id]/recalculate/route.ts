/**
 * POST /api/orders/[id]/recalculate
 *
 * 1. Načte Order + items + costs + active PricingConfig (nebo Order.pricingConfigSnapshot)
 * 2. Pokud Order.pricingConfigSnapshot je null a Order.pricingConfigId odkazuje na
 *    aktivní config, vytvoří snapshot do Order (kanonický zdroj pravdy).
 * 3. Pustí calculateOrderPricing
 * 4. Zapíše perStone výsledky zpět do Item.computed*, recommended*, finalInternal*, pricingStatus
 * 5. Vrátí summary + perStone (pro UI)
 *
 * Stones se zapisují v jedné transakci. Lastcalculated timestamp se nastaví
 * na Order.lastCalculatedAt + Item.lastCalculatedAt.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { calculateOrderPricing } from '@/lib/pricing';
import type {
  OrderPricingInput,
  PricingConfigSnapshot,
  StoneInput,
} from '@/lib/pricing';
import { serializeItemForPricing, serializeOrder } from '@/lib/orders/serialize';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      costs: true,
      // Box data potřebujeme pro per-Box PPG fallback v calculate.ts
      // (Item PPG → Box PPG → Box.amount/weight → Order default)
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
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Snapshot strategie:
  //  - Pokud order.pricingConfigSnapshot je už uložený, použij ho (reprodukovatelnost)
  //  - Jinak: pokud Order.pricingConfigId odkazuje na config, vezmi current rules + ulož jako snapshot
  //  - Jinak: použij prázdný config (žádné marže)
  let snapshot: PricingConfigSnapshot;
  let updateSnapshot: { snapshotJson: unknown; configId: number | null; version: number } | null = null;

  if (order.pricingConfigSnapshot && isValidSnapshot(order.pricingConfigSnapshot)) {
    snapshot = order.pricingConfigSnapshot as unknown as PricingConfigSnapshot;
  } else if (order.pricingConfig) {
    snapshot = order.pricingConfig.rules as unknown as PricingConfigSnapshot;
    updateSnapshot = {
      snapshotJson: order.pricingConfig.rules,
      configId: order.pricingConfig.id,
      version: typeof (snapshot as { version?: number }).version === 'number' ? (snapshot as { version: number }).version : 1,
    };
  } else {
    snapshot = { version: 1, missingValuePolicy: 'warn', rules: [] };
  }

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
    config: snapshot,
  };

  const result = calculateOrderPricing(input);

  // Map originálních items pro lookup současného salePrice (auto-fill logika).
  const itemsById = new Map(order.items.map((it) => [it.id, it]));

  // Zapsat výsledky do Items v transakci
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const r of result.perStone) {
      // Auto-fill „Cena prodejní" (salePrice) = recommended VŽDY při každém
      // recalc. Když user chce speciální cenu mimo cenotvorbu, použije pole
      // „Cena speciální" (manualPriceInclVatCzk) — to je explicit override
      // mechanizmus s vlastní semantikou (NEEDS_REVIEW pokud pod recommended).
      // Předtím byl detekovaný „user override" který způsoboval že po změně
      // marginu zůstávala stará salePrice — matoucí.
      const newRecommended = r.steps?.recommendedPriceInclVatCzk
        ? Number(r.steps.recommendedPriceInclVatCzk)
        : 0;
      const shouldAutoFillSale = newRecommended > 0;

      await tx.item.update({
        where: { id: r.stoneId },
        data: {
          // purchasePrice = weight × resolved PPG (z fallback řetězce kazety nebo zakázky).
          // Item.purchasePrice je computed display field — updatuje se i když ho
          // user nepřepsal ručně, aby sekce Ceny v UI zobrazila aktuální nákupní cenu.
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
          lastCalculatedAt: now,
        },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        lastCalculatedAt: now,
        status: order.status === 'DRAFT' ? 'PRICED' : order.status,
        ...(updateSnapshot
          ? {
              pricingConfigSnapshot: updateSnapshot.snapshotJson as never,
              pricingConfigVersion: updateSnapshot.version,
            }
          : {}),
      },
    });
  });

  await logActivity(
    session.id,
    'order.recalculate',
    order.code,
    JSON.stringify({
      stones: result.perStone.length,
      ok: result.summary.stonesOk,
      needsInput: result.summary.stonesNeedingInput,
      needsReview: result.summary.stonesNeedingReview,
    })
  );

  // Vrátit fresh data z DB
  const fresh = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, costs: true },
  });

  return NextResponse.json({
    summary: result.summary,
    perStone: result.perStone,
    warnings: result.warnings,
    order: fresh ? serializeOrder(fresh) : null,
    items: fresh ? fresh.items.map(serializeItemForPricing) : [],
  });
}

function isValidSnapshot(input: unknown): input is { version: number; missingValuePolicy: string; rules: unknown[] } {
  if (typeof input !== 'object' || input === null) return false;
  const i = input as Record<string, unknown>;
  return typeof i.version === 'number' && typeof i.missingValuePolicy === 'string' && Array.isArray(i.rules);
}
