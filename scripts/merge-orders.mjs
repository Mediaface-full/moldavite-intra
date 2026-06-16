#!/usr/bin/env node
/**
 * Sloučí N source zakázek (Order) do jedné target zakázky.
 *
 * Co se přesune do TARGET (v jedné transakci):
 *  - všechny Item.orderId   ze sources → target
 *  - všechny Box.orderId    ze sources → target
 *  - všechny OrderCostItem  ze sources → target
 *
 * Po přesunu jsou source Order PRÁZDNÉ a SMAŽOU SE.
 *
 * Target Order si zachovává své vlastní:
 *  - cenotvorbu (allocationMethod, vatRatePct, roundingStep, defaultPPG)
 *  - pricingConfig + snapshot
 *  - status (DRAFT zůstane DRAFT, ne přepisuje se)
 *
 * Po sloučení MUSÍŠ ručně:
 *  1. Upravit target metadata (totalPurchaseAmountCzk = nový součet)
 *     — script to nedělá automaticky, protože součet zakázek může mít
 *     business význam (např. byly to fakticky 6 různých nákupů s vlastními cenami).
 *  2. Spustit "Přepočítat zakázku" v UI nebo POST /api/orders/[id]/recalculate
 *     — protože alokace nákladů se teď počítá přes víc kamenů.
 *
 * Spuštění:
 *   node scripts/merge-orders.mjs --target MIG-K0001 --sources MIG-K0002,MIG-K0003 --dry-run
 *   node scripts/merge-orders.mjs --target MIG-K0001 --sources MIG-K0002,MIG-K0003
 *
 * Na NASu:
 *   docker exec moldavite_app node scripts/merge-orders.mjs --target MIG-K0001 \
 *     --sources MIG-K0002,MIG-K0003,MIG-K0004,MIG-K0005,MIG-K0006 --dry-run
 *
 * Idempotence: pokud source Order už neexistuje (např. po prvním běhu), preskočí ji
 * s warning. Pokud target Order neexistuje, skript okamžitě selže.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { target: null, sources: [], dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target') out.target = args[++i];
    else if (args[i] === '--sources') out.sources = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (args[i] === '--dry-run') out.dryRun = true;
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Použití: node scripts/merge-orders.mjs --target CODE --sources CODE,CODE [--dry-run]');
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const { target, sources, dryRun } = parseArgs();

  if (!target || sources.length === 0) {
    console.error('✗ Chybí --target nebo --sources.');
    console.error('Použití: node scripts/merge-orders.mjs --target Z2026-001 --sources Z2026-002,Z2026-003 [--dry-run]');
    process.exit(1);
  }
  if (sources.includes(target)) {
    console.error(`✗ Target ${target} nesmí být v --sources.`);
    process.exit(1);
  }

  console.log(`==> Merge orders (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  console.log(`    Target:  ${target}`);
  console.log(`    Sources: ${sources.join(', ')}`);
  console.log('');

  // 1. Validace
  const targetOrder = await prisma.order.findUnique({
    where: { code: target },
    include: { _count: { select: { items: true, costs: true, boxes: true } } },
  });
  if (!targetOrder) {
    console.error(`✗ Target Order "${target}" neexistuje.`);
    process.exit(1);
  }

  const sourceOrders = await prisma.order.findMany({
    where: { code: { in: sources } },
    include: { _count: { select: { items: true, costs: true, boxes: true } } },
  });

  const foundCodes = new Set(sourceOrders.map((o) => o.code));
  const missing = sources.filter((s) => !foundCodes.has(s));
  if (missing.length > 0) {
    console.warn(`⚠ Source Order nenalezené (přeskočím): ${missing.join(', ')}`);
  }

  if (sourceOrders.length === 0) {
    console.log('Žádné source Order k merge — nic neudělám.');
    process.exit(0);
  }

  // 2. Preview
  console.log(`==> Target před merge:`);
  console.log(`    ${targetOrder.code}: ${targetOrder._count.items} kamenů, ${targetOrder._count.boxes} krabic, ${targetOrder._count.costs} nákladů`);
  console.log('');
  console.log(`==> Source Order k merge (${sourceOrders.length}):`);
  let totalItems = 0;
  let totalBoxes = 0;
  let totalCosts = 0;
  for (const o of sourceOrders) {
    console.log(`    ${o.code}: ${o._count.items} kamenů, ${o._count.boxes} krabic, ${o._count.costs} nákladů`);
    totalItems += o._count.items;
    totalBoxes += o._count.boxes;
    totalCosts += o._count.costs;
  }
  console.log('');
  console.log(`==> Po merge bude target obsahovat:`);
  console.log(`    ${targetOrder.code}: ${targetOrder._count.items + totalItems} kamenů, ${targetOrder._count.boxes + totalBoxes} krabic, ${targetOrder._count.costs + totalCosts} nákladů`);
  console.log(`    Source Order budou SMAZÁNY: ${sourceOrders.map((o) => o.code).join(', ')}`);
  console.log('');

  if (dryRun) {
    console.log('✓ DRY RUN — nic se nezměnilo. Pro ostrý běh spusť bez --dry-run.');
    return;
  }

  // 3. Live merge — vše v jedné transakci
  const sourceIds = sourceOrders.map((o) => o.id);
  const result = await prisma.$transaction(async (tx) => {
    const itemsMoved = await tx.item.updateMany({
      where: { orderId: { in: sourceIds } },
      data: { orderId: targetOrder.id, pricingStatus: 'STALE' },
    });
    const boxesMoved = await tx.box.updateMany({
      where: { orderId: { in: sourceIds } },
      data: { orderId: targetOrder.id },
    });
    const costsMoved = await tx.orderCostItem.updateMany({
      where: { orderId: { in: sourceIds } },
      data: { orderId: targetOrder.id },
    });
    const deletedOrders = await tx.order.deleteMany({
      where: { id: { in: sourceIds } },
    });
    return {
      itemsMoved: itemsMoved.count,
      boxesMoved: boxesMoved.count,
      costsMoved: costsMoved.count,
      deletedOrders: deletedOrders.count,
    };
  });

  console.log(`✓ Hotovo:`);
  console.log(`    Items přesunuto:  ${result.itemsMoved}`);
  console.log(`    Boxes přesunuto:  ${result.boxesMoved}`);
  console.log(`    Costs přesunuto:  ${result.costsMoved}`);
  console.log(`    Orders smazáno:   ${result.deletedOrders}`);
  console.log('');
  console.log(`==> Dalšich kroků:`);
  console.log(`    1. Otevři ${targetOrder.code} v admin UI a zkontroluj metadata`);
  console.log(`       (sellerName, purchaseDate, totalPurchaseAmountCzk, notes).`);
  console.log(`    2. Pokud target Order měl nějaké náklady nebo cenotvorbu nastavenou,`);
  console.log(`       klikni "Přepočítat zakázku" — alokace teď bere víc kamenů.`);
  console.log(`    3. Kameny mají pricingStatus=STALE → po přepočtu budou OK / NEEDS_REVIEW.`);
}

main()
  .catch((err) => {
    console.error('✗ Merge selhal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
