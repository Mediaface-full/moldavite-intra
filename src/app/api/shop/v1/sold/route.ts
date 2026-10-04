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
      return shopError(409, 'conflict', err.code);
    }
    console.error('[shop-api] sold failed', err);
    return shopError(500, 'internal');
  }
}
