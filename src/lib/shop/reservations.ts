/**
 * Rezervace a prodej kamenů z e-shopu BM SHOP (Shop API v1 — app/docs/SHOP-API.md).
 *
 * Souběh: dva košíky / objednávky na stejný kámen — každá operace zamkne řádek Item
 * (`SELECT … FOR UPDATE`) v transakci, takže kontrola „není prodaný / není rezervovaný jinde"
 * a zápis jsou atomické.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applySoldTransition } from '@/lib/items/markSold';
import { ensureCertificate, verifyUrlFor } from '@/lib/items/certificate';
import { skuOf } from '@/lib/shop/catalog';

export const MIN_TTL = 60;
export const MAX_TTL = 86_400;

export class ShopConflict extends Error {
  constructor(public code: 'item_sold' | 'item_reserved' | 'not_on_shop' | 'not_found') {
    super(code);
  }
}

async function lockItem(tx: Prisma.TransactionClient, itemId: number) {
  await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ${itemId} FOR UPDATE`;
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { id: true, sold: true, onShop: true, shopOrderNumber: true, certHash: true, certIssuedAt: true, soldAt: true, evidNumber: true, box: { select: { code: true } } },
  });
  if (!item) throw new ShopConflict('not_found');
  return item;
}

/** Vytvoří nebo prodlouží rezervaci (stejný itemId + ref = prodloužení). */
export async function reserveItem(itemId: number, ref: string, ttlSeconds: number) {
  const ttl = Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(ttlSeconds)));
  return prisma.$transaction(async (tx) => {
    const item = await lockItem(tx, itemId);
    if (item.sold) throw new ShopConflict('item_sold');
    if (!item.onShop) throw new ShopConflict('not_on_shop');

    const now = new Date();
    const other = await tx.shopReservation.findFirst({
      where: { itemId, ref: { not: ref }, releasedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (other) throw new ShopConflict('item_reserved');

    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const reservation = await tx.shopReservation.upsert({
      where: { itemId_ref: { itemId, ref } },
      update: { expiresAt, releasedAt: null },
      create: { itemId, ref, expiresAt },
      select: { id: true, itemId: true, expiresAt: true },
    });
    return { reservation, sku: skuOf(item) };
  });
}

/** Uvolní rezervaci (idempotentní — neexistující / už uvolněná = false). */
export async function releaseReservation(id: string): Promise<{ released: boolean; itemId?: number }> {
  const res = await prisma.shopReservation.updateMany({ where: { id, releasedAt: null }, data: { releasedAt: new Date() } });
  if (res.count === 0) return { released: false };
  const r = await prisma.shopReservation.findUnique({ where: { id }, select: { itemId: true } });
  return { released: true, itemId: r?.itemId };
}

export type SoldInput = { itemId: number; orderNumber: string; paidAt?: Date };

/**
 * Prodej z e-shopu: sold + soldAt + shopOrderNumber, cenový snapshot (stejně jako ruční prodej),
 * zrušení rezervací kusu a vystavení certifikátu — vše v jedné transakci.
 * Stejný orderNumber podruhé = idempotentní úspěch (e-shop může hlášení opakovat).
 */
export async function markSoldFromShop(input: SoldInput) {
  const existing = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { sold: true, shopOrderNumber: true, soldAt: true, certHash: true, certIssuedAt: true, evidNumber: true, box: { select: { code: true } } },
  });
  if (!existing) throw new ShopConflict('not_found');
  if (existing.sold) {
    if (existing.shopOrderNumber === input.orderNumber && existing.certHash && existing.certIssuedAt) {
      return {
        idempotent: true,
        item: { id: input.itemId, sku: skuOf(existing), soldAt: existing.soldAt },
        cert: { hash: existing.certHash, issuedAt: existing.certIssuedAt, verifyUrl: verifyUrlFor(existing.certHash) },
      };
    }
    throw new ShopConflict('item_sold');
  }

  const soldAt = input.paidAt ?? new Date();
  const result = await applySoldTransition(
    input.itemId,
    { sold: true, soldAt, shopOrderNumber: input.orderNumber },
    async (tx) => {
      await tx.shopReservation.updateMany({ where: { itemId: input.itemId, releasedAt: null }, data: { releasedAt: new Date() } });
      const item = await tx.item.findUniqueOrThrow({
        where: { id: input.itemId },
        select: { id: true, certHash: true, certIssuedAt: true, evidNumber: true, box: { select: { code: true } } },
      });
      const cert = await ensureCertificate(tx, item, skuOf(item));
      return { sku: skuOf(item), cert };
    },
    async (tx) => {
      const locked = await lockItem(tx, input.itemId);
      if (locked.sold) throw new ShopConflict('item_sold');
    },
  );

  return {
    idempotent: false,
    item: { id: input.itemId, sku: result!.sku, soldAt },
    cert: { hash: result!.cert.certHash, issuedAt: result!.cert.certIssuedAt, verifyUrl: verifyUrlFor(result!.cert.certHash) },
  };
}
