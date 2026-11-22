/**
 * POST /api/shop/v1/sold — kámen prodán a zaplacen v e-shopu.
 * Intra: sold + soldAt + cenový snapshot (stejně jako ruční prodej) + zrušení rezervací + certifikát.
 * Stejný orderNumber podruhé = 200 (idempotence). Kontrakt: app/docs/SHOP-API.md.
 */
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/auth';
import { authorizeShop, shopError, shopJson } from '@/lib/shop/auth';
import { markSoldFromShop, ShopConflict } from '@/lib/shop/reservations';
import { shopSystemUserId } from '@/lib/shop/systemUser';
import { parseSoldBody, readJson } from '@/lib/shop/validate';
import { prisma } from '@/lib/prisma';
import { alertEtsy } from '@/lib/etsy/alerts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = authorizeShop(request);
  if (auth instanceof NextResponse) return auth;

  const input = parseSoldBody(await readJson(request));
  if ('invalid' in input) return shopError(422, 'invalid', input.invalid);

  try {
    const result = await markSoldFromShop(input);
    if (!result.idempotent) {
      await logActivity(await shopSystemUserId(), 'shop.sold', result.item.sku, input.details, auth.ip);
    }
    return shopJson({ item: result.item, cert: result.cert });
  } catch (err) {
    if (err instanceof ShopConflict) {
      if (err.code === 'not_found') return shopError(404, 'not_found');
      await logActivity(await shopSystemUserId(), 'shop.sold_conflict', String(input.itemId), input.details, auth.ip);
      if (err.code === 'item_sold') await flagEtsyDoubleSale(input.itemId, input.orderNumber);
      return shopError(409, 'conflict', err.code);
    }
    console.error('[shop-api] sold failed', err);
    return shopError(500, 'internal');
  }
}

/** E-shop zaplatil kámen, který už se prodal na Etsy → konflikt: lišta v intru + e-mail (spec, výjimka varianty A). */
async function flagEtsyDoubleSale(itemId: number, shopOrder: string) {
  try {
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { soldChannel: true, etsyReceiptId: true, evidNumber: true, box: { select: { code: true } } } });
    if (!item || item.soldChannel !== 'etsy' || !item.etsyReceiptId) return;
    const catalogNumber = `${item.box.code}-${item.evidNumber}`;
    // Jen při prvním hlášení — e-shop 409 opakuje a každé opakování by poslalo další e-mail
    const r = await prisma.etsyOrder.updateMany({
      where: { receiptId: item.etsyReceiptId, conflict: false },
      data: { conflict: true, conflictNote: `${catalogNumber} zaplacen i na e-shopu (objednávka ${shopOrder})`, resolvedAt: null },
    });
    if (r.count > 0) await alertEtsy('double_sale', { catalogNumber, receiptId: item.etsyReceiptId, shopOrder });
  } catch (err) {
    console.error('[shop-api] upozornění na dvojí prodej selhalo', err instanceof Error ? err.message : err);
  }
}
