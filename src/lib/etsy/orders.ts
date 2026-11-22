/**
 * Prodej z Etsy: zaplacená objednávka (webhook order.paid i polling getShopReceipts) → kámen prodaný v intru.
 * Idempotence: řádek EtsyOrder (receiptId unique) se založí PŘED zpracováním — webhook a polling souběžně
 * nezpracují stejnou objednávku dvakrát.
 * Pravidla (spec, Gideon 21. 11. 2026 varianta A): zaplacená objednávka vyhrává nad košíkem e-shopu;
 * kámen už prodaný jinde = konflikt (nic se nemění, upozornění).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { applySoldTransition } from '@/lib/items/markSold';
import { ensureCertificate } from '@/lib/items/certificate';
import { skuOf } from '@/lib/shop/catalog';
import { notifyShopItemsChanged } from '@/lib/shop/notify';
import type { EtsyClient, EtsyReceipt } from './client';
import { alertEtsy, etsySystemUserId } from './alerts';
import { enqueueEtsyJob, kickEtsy } from './queue';

export type SellOutcome = 'sold' | 'sold_with_reservation' | 'already_sold';
export interface OrderDeps {
  claimOrder: (receiptId: number, listingIds: number[], paidAt: Date) => Promise<boolean>;
  finishOrder: (receiptId: number, data: { itemIds: number[]; conflict: boolean; conflictNote: string | null }) => Promise<void>;
  mapItems: (tx: EtsyReceipt['transactions']) => Promise<Array<{ listingId: number; itemId: number | null }>>;
  sellItem: (itemId: number, receiptId: number, paidAt: Date) => Promise<{ outcome: SellOutcome; catalogNumber: string; shopOrder: string }>;
  alert: typeof alertEtsy;
  log: (action: string, details: string) => Promise<void>;
  notifyShop: (ids: number[]) => Promise<void>;
}

export function receiptIdFromResourceUrl(url: string | undefined | null): number | null {
  const m = /^https:\/\/api\.etsy\.com\/v3\/application\/shops\/\d+\/receipts\/(\d+)(?:[/?]|$)/.exec(url ?? '');
  return m ? Number(m[1]) : null;
}

export async function handleEtsyReceiptWith(receipt: EtsyReceipt, source: 'webhook' | 'poll', d: OrderDeps): Promise<{ status: 'sold' | 'duplicate' | 'conflict' | 'ignored'; itemIds: number[] }> {
  if (!receipt.is_paid) return { status: 'ignored', itemIds: [] };
  const paidAt = new Date(receipt.created_timestamp * 1000);
  const listingIds = receipt.transactions.map((t) => t.listing_id);
  if (!(await d.claimOrder(receipt.receipt_id, listingIds, paidAt))) return { status: 'duplicate', itemIds: [] };

  const mapped = await d.mapItems(receipt.transactions);
  const sold: number[] = [];
  const notes: string[] = [];
  for (const m of mapped) {
    if (m.itemId === null) {
      await d.log('etsy.unknown_listing', `Etsy objednávka ${receipt.receipt_id}: listing ${m.listingId} intra nezná (${source})`);
      continue;
    }
    const r = await d.sellItem(m.itemId, receipt.receipt_id, paidAt);
    if (r.outcome === 'already_sold') {
      notes.push(`${r.catalogNumber} už byl prodaný${r.shopOrder ? ` (e-shop ${r.shopOrder})` : ''}`);
      await d.alert('double_sale', { catalogNumber: r.catalogNumber, receiptId: receipt.receipt_id, shopOrder: r.shopOrder || undefined });
      continue;
    }
    sold.push(m.itemId);
    if (r.outcome === 'sold_with_reservation') await d.alert('sold_with_reservation', { catalogNumber: r.catalogNumber, receiptId: receipt.receipt_id });
  }
  const conflict = notes.length > 0;
  await d.finishOrder(receipt.receipt_id, { itemIds: sold, conflict, conflictNote: conflict ? notes.join('; ') : null });
  if (sold.length) await d.notifyShop(sold);
  return { status: conflict ? 'conflict' : sold.length ? 'sold' : 'ignored', itemIds: sold };
}

// ── Napojení na Prisma ──────────────────────────────────────────

class AlreadySold extends Error {}

async function sellItemDb(itemId: number, receiptId: number, paidAt: Date): Promise<{ outcome: SellOutcome; catalogNumber: string; shopOrder: string }> {
  const head = await prisma.item.findUnique({ where: { id: itemId }, select: { evidNumber: true, shopOrderNumber: true, box: { select: { code: true } } } });
  const catalogNumber = head ? `${head.box.code}-${head.evidNumber}` : `#${itemId}`;
  let hadReservation = false;
  try {
    await applySoldTransition(
      itemId,
      { sold: true, soldAt: paidAt, soldChannel: 'etsy', etsyReceiptId: BigInt(receiptId) },
      async (tx) => {
        const active = await tx.shopReservation.count({ where: { itemId, releasedAt: null, expiresAt: { gt: new Date() } } });
        hadReservation = active > 0;
        await tx.shopReservation.updateMany({ where: { itemId, releasedAt: null }, data: { releasedAt: new Date() } });
        await enqueueEtsyJob(tx, itemId, 'deactivate', 'sold');
        const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { id: true, certHash: true, certIssuedAt: true, evidNumber: true, box: { select: { code: true } } } });
        await ensureCertificate(tx, item, skuOf(item));
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ${itemId} FOR UPDATE`;
        const it = await tx.item.findUnique({ where: { id: itemId }, select: { sold: true } });
        if (it?.sold) throw new AlreadySold();
      },
    );
  } catch (err) {
    if (err instanceof AlreadySold) return { outcome: 'already_sold', catalogNumber, shopOrder: head?.shopOrderNumber ?? '' };
    throw err;
  }
  kickEtsy([itemId]);
  await logActivity(await etsySystemUserId(), 'etsy.sold', catalogNumber, `Prodáno na Etsy, objednávka ${receiptId}${hadReservation ? ' — kámen měl rezervaci e-shopu' : ''}`);
  return { outcome: hadReservation ? 'sold_with_reservation' : 'sold', catalogNumber, shopOrder: '' };
}

export const prismaOrderDeps: OrderDeps = {
  claimOrder: async (receiptId, listingIds, paidAt) => {
    try {
      await prisma.etsyOrder.create({ data: { receiptId: BigInt(receiptId), listingIds: listingIds.map(BigInt), paidAt } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  },
  finishOrder: async (receiptId, data) => { await prisma.etsyOrder.update({ where: { receiptId: BigInt(receiptId) }, data }); },
  mapItems: async (txs) => {
    const listings = await prisma.etsyListing.findMany({ where: { listingId: { in: txs.map((t) => BigInt(t.listing_id)) } }, select: { listingId: true, itemId: true } });
    const byListing = new Map(listings.map((l) => [String(l.listingId), l.itemId]));
    const out: Array<{ listingId: number; itemId: number | null }> = [];
    for (const t of txs) {
      let itemId = byListing.get(String(t.listing_id)) ?? null;
      const m = itemId === null && t.sku ? /^(K\d+)-(.+)$/.exec(t.sku) : null; // záloha: SKU = katalogové číslo
      if (m) itemId = (await prisma.item.findFirst({ where: { evidNumber: m[2], box: { code: m[1] } }, select: { id: true } }))?.id ?? null;
      out.push({ listingId: t.listing_id, itemId });
    }
    return out;
  },
  sellItem: sellItemDb,
  alert: alertEtsy,
  log: async (action, details) => { await logActivity(await etsySystemUserId(), action, '', details); },
  notifyShop: (ids) => notifyShopItemsChanged(ids),
};

export function handleEtsyReceipt(receipt: EtsyReceipt, source: 'webhook' | 'poll') {
  return handleEtsyReceiptWith(receipt, source, prismaOrderDeps);
}

/** Polling zaplacených objednávek (záloha za webhook): od poslední zpracované − 1 h, první běh posledních 24 h. */
export async function pollEtsyReceipts(client: EtsyClient): Promise<number> {
  const last = await prisma.etsyOrder.findFirst({ orderBy: { processedAt: 'desc' }, select: { processedAt: true } });
  const since = last ? last.processedAt.getTime() - 3_600_000 : Date.now() - 86_400_000;
  const receipts = await client.getPaidReceipts(Math.floor(since / 1000));
  let n = 0;
  for (const r of receipts) {
    const res = await handleEtsyReceipt(r, 'poll');
    if (res.status !== 'duplicate' && res.status !== 'ignored') n++;
  }
  return n;
}
