#!/usr/bin/env node
/**
 * Rollback backfill-orders.mjs.
 *
 * 1. Nuluje Item.orderId, Item.manualPriceInclVatCzk, Item.pricingStatus pro items s MIG-* / LEGACY-IMPORT Order
 * 2. Nuluje Box.orderId pro boxy s MIG-* Order
 * 3. Smaže Order MIG-* a LEGACY-IMPORT (s prázdnými items)
 * 4. Nesahá na PricingConfig "Migrace baseline" (admin si ji smaže ručně pokud chce)
 *
 * Spuštění:
 *   docker exec moldavite_app node scripts/rollback-backfill-orders.mjs --dry-run
 *   docker exec moldavite_app node scripts/rollback-backfill-orders.mjs
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  console.log(`==> Rollback backfill orders (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);

  const migOrders = await prisma.order.findMany({
    where: { OR: [{ code: { startsWith: 'MIG-' } }, { code: 'LEGACY-IMPORT' }] },
    select: { id: true, code: true, _count: { select: { items: true } } },
  });

  console.log(`==> ${migOrders.length} migration orders k rollbacku`);
  let nulledItems = 0;
  let nulledBoxes = 0;
  let deletedOrders = 0;

  for (const o of migOrders) {
    console.log(`  - ${o.code} (id=${o.id}, items=${o._count.items})`);
    if (DRY_RUN) {
      nulledItems += o._count.items;
      deletedOrders++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const n = await tx.item.updateMany({
        where: { orderId: o.id },
        data: { orderId: null, manualPriceInclVatCzk: null, pricingStatus: 'NEEDS_INPUT' },
      });
      const b = await tx.box.updateMany({
        where: { orderId: o.id },
        data: { orderId: null },
      });
      nulledItems += n.count;
      nulledBoxes += b.count;
      await tx.order.delete({ where: { id: o.id } });
      deletedOrders++;
    });
  }

  console.log('');
  console.log(`✓ ${DRY_RUN ? 'WOULD NULL' : 'NULLED'} ${nulledItems} items, ${nulledBoxes} boxes; ${DRY_RUN ? 'WOULD DELETE' : 'DELETED'} ${deletedOrders} orders`);
}

main()
  .catch((err) => { console.error('✗ Rollback selhal:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
