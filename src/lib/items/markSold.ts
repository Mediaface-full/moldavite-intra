/**
 * Přechod kamene na „prodáno" (sold false → true) se zafixováním cenového auditu.
 *
 * Vytaženo z PATCH /api/items/[id] (ruční prodej v intru), aby stejnou cestou šel i prodej
 * z e-shopu (Shop API v1 POST /sold). Chování je 1:1 s původním kódem:
 *   - v jedné transakci: update Item (předaná data) → captureItemSaleSnapshot → uložit snapshot
 *   - snapshot reflektuje hodnoty PO update (viz komentář v items route)
 * `guard` běží jako PRVNÍ krok transakce (e-shop: zámek řádku + kontrola, že kámen ještě není prodaný;
 * vyhozená výjimka transakci zruší). `extra` běží na konci STEJNÉ transakce (zrušení rezervací, certifikát).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureItemSaleSnapshot } from '@/lib/orders/captureItemSaleSnapshot';

export async function applySoldTransition<T = void>(
  itemId: number,
  data: Prisma.ItemUpdateInput | Record<string, unknown>,
  extra?: (tx: Prisma.TransactionClient) => Promise<T>,
  guard?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<T | undefined> {
  return prisma.$transaction(async (tx) => {
    if (guard) await guard(tx);
    await tx.item.update({ where: { id: itemId }, data: data as Prisma.ItemUpdateInput });
    const capturedAt = new Date();
    const snap = await captureItemSaleSnapshot(tx, itemId, capturedAt);
    if (snap) {
      await tx.item.update({
        where: { id: itemId },
        data: {
          priceCalcSnapshot: snap as never,
          priceCalcSnapshotAt: capturedAt,
        },
      });
    }
    return extra ? extra(tx) : undefined;
  });
}
