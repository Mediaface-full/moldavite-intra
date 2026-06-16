#!/usr/bin/env node
/**
 * Backfill Order entity pro existující data.
 *
 * Strategie: 1 Box → 1 Order (1:1).
 * - Order.code = "MIG-{box.code}", title = "Migrace " + box.name
 * - status = DRAFT, allocationMethod = BY_WEIGHT, vatRate = 21, roundingStep = 10
 * - totalPurchaseAmountCzk = SUM(items.purchasePrice)
 * - declaredPieces = COUNT(items), declaredWeight = SUM(weight)
 * - purchaseDate = MIN(items.createdAt)
 * - Box.orderId = order.id
 * - Item.orderId = order.id
 * - Item.manualPriceInclVatCzk = item.salePrice (pokud > 0)
 * - Item.pricingStatus = NEEDS_INPUT
 *
 * Plus vytvoří jednu PricingConfig "Migrace baseline" s prázdnými pravidly,
 * inactive. Order ji nedostávají přiřazenou — uživatel musí ručně vybrat.
 *
 * Plus speciální Order "LEGACY-IMPORT" pro kameny mimo Box (kdyby nějaké byly).
 *
 * Idempotentní: lze spustit vícekrát. Detekce: kámen už má orderId → přeskočit.
 *
 * Spuštění:
 *   docker exec moldavite_app node scripts/backfill-orders.mjs --dry-run
 *   docker exec moldavite_app node scripts/backfill-orders.mjs
 *
 * Rollback:
 *   docker exec moldavite_app node scripts/rollback-backfill-orders.mjs
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient();

async function main() {
  console.log(`==> Backfill orders (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);
  console.log(`    Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // 1. PricingConfig "Migrace baseline"
  let baseline = await prisma.pricingConfig.findFirst({ where: { name: 'Migrace baseline' } });
  if (!baseline) {
    console.log('==> Vytvářím PricingConfig "Migrace baseline"');
    if (!DRY_RUN) {
      baseline = await prisma.pricingConfig.create({
        data: {
          name: 'Migrace baseline',
          active: false,
          rules: { version: 1, missingValuePolicy: 'warn', rules: [] },
        },
      });
    }
  } else {
    console.log(`    PricingConfig "Migrace baseline" už existuje (id=${baseline.id})`);
  }

  // 2. Pro každý Box bez orderId vytvoř Order
  const boxes = await prisma.box.findMany({
    where: { orderId: null },
    include: {
      items: {
        select: { id: true, purchasePrice: true, salePrice: true, weight: true, createdAt: true, orderId: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  console.log(`==> ${boxes.length} boxů ke zpracování`);
  let createdOrders = 0;
  let updatedItems = 0;

  for (const box of boxes) {
    const code = `MIG-${box.code}`;
    const title = `Migrace ${box.name ?? box.code}`;
    const itemsCount = box.items.length;
    const sumPurchase = box.items.reduce((s, i) => s + Number(i.purchasePrice), 0);
    const sumWeight = box.items.reduce((s, i) => s + Number(i.weight), 0);
    // Reduce vrací Date | null. Pokud má items, vezme nejstarší createdAt;
    // pojistka new Date(...) když Prisma vrátí jiný typ.
    let oldestDate = null;
    for (const i of box.items) {
      const d = i.createdAt instanceof Date ? i.createdAt : new Date(i.createdAt);
      if (oldestDate === null || d < oldestDate) oldestDate = d;
    }

    console.log(`  - ${box.code} → ${code} (${itemsCount} ks, ${sumPurchase.toFixed(2)} Kč, ${sumWeight.toFixed(2)} g)`);

    if (DRY_RUN) {
      createdOrders++;
      updatedItems += itemsCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // Idempotence: pokud Order MIG-XXX už existuje, použij ho
      let order = await tx.order.findUnique({ where: { code } });
      if (!order) {
        order = await tx.order.create({
          data: {
            code,
            title,
            sellerName: '?',
            purchaseDate: oldestDate,
            declaredPieces: itemsCount,
            declaredWeight: sumWeight,
            sourceCurrency: 'CZK',
            totalPurchaseAmountSource: sumPurchase,
            totalPurchaseAmountCzk: sumPurchase,
            allocationMethod: 'BY_WEIGHT',
            vatRatePct: 21,
            roundingStep: 10,
            status: 'DRAFT',
          },
        });
        createdOrders++;
      }

      await tx.box.update({ where: { id: box.id }, data: { orderId: order.id } });

      for (const item of box.items) {
        if (item.orderId !== null) continue; // už migrován
        const salePrice = Number(item.salePrice);
        await tx.item.update({
          where: { id: item.id },
          data: {
            orderId: order.id,
            manualPriceInclVatCzk: salePrice > 0 ? salePrice : null,
            pricingStatus: 'NEEDS_INPUT',
          },
        });
        updatedItems++;
      }
    });
  }

  // 3. Skutečné sirotky = items bez Order PO loopu výše. V aktuálním schématu
  //    Item.boxId NOT NULL, takže by orphans nikdy nemělo nastat — ale skript
  //    nechává obrannou větev pro případ že schema v budoucnu dovolí orphan items.
  //    V DRY_RUN přeskočíme query (chybně by zahrnoval items co live běh přiřadí
  //    přes boxes, nic se nezapsalo).
  const orphans = DRY_RUN ? [] : await prisma.item.findMany({ where: { orderId: null }, select: { id: true } });
  if (orphans.length > 0) {
    console.log(`==> ${orphans.length} kamenů mimo box → LEGACY-IMPORT`);
    if (!DRY_RUN) {
      let legacy = await prisma.order.findUnique({ where: { code: 'LEGACY-IMPORT' } });
      if (!legacy) {
        legacy = await prisma.order.create({
          data: {
            code: 'LEGACY-IMPORT',
            title: 'Migrované kameny bez Box',
            sellerName: 'Migrace',
            status: 'ARCHIVED',
            allocationMethod: 'BY_WEIGHT',
            vatRatePct: 21,
            roundingStep: 10,
          },
        });
      }
      await prisma.item.updateMany({
        where: { orderId: null },
        data: { orderId: legacy.id, pricingStatus: 'NEEDS_INPUT' },
      });
      updatedItems += orphans.length;
    }
  }

  console.log('');
  console.log(`✓ ${DRY_RUN ? 'WOULD CREATE' : 'CREATED'} ${createdOrders} orders, ${DRY_RUN ? 'WOULD UPDATE' : 'UPDATED'} ${updatedItems} items`);

  // 4. Verifikace
  if (!DRY_RUN) {
    const orphansLeft = await prisma.item.count({ where: { orderId: null } });
    const totalOrders = await prisma.order.count();
    console.log('');
    console.log(`==> Po migraci:`);
    console.log(`    Order: ${totalOrders}`);
    console.log(`    Item bez orderId: ${orphansLeft}`);
    if (orphansLeft > 0) {
      console.error(`✗ POZOR: ${orphansLeft} items zůstalo bez orderId — zkontroluj!`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((err) => {
    console.error('✗ Backfill selhal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
