/**
 * POST /api/shop/v1/reservations — rezervace / prodloužení rezervace kamene z košíku e-shopu.
 * Kontrakt: app/docs/SHOP-API.md. Souběh řeší zámek řádku v lib/shop/reservations.ts.
 */
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/auth';
import { authorizeShop, shopError, shopJson } from '@/lib/shop/auth';
import { reserveItem, ShopConflict } from '@/lib/shop/reservations';
import { shopSystemUserId } from '@/lib/shop/systemUser';
import { parseReservationBody, readJson } from '@/lib/shop/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = authorizeShop(request);
  if (auth instanceof NextResponse) return auth;

  const input = parseReservationBody(await readJson(request));
  if ('invalid' in input) return shopError(422, 'invalid', input.invalid);

  try {
    const { reservation, sku } = await reserveItem(input.itemId, input.ref, input.ttlSeconds);
    await logActivity(await shopSystemUserId(), 'shop.reserve', sku, `ref=${input.ref} do ${reservation.expiresAt.toISOString()}`, auth.ip);
    return shopJson({ reservation }, 201);
  } catch (err) {
    if (err instanceof ShopConflict) {
      return err.code === 'not_found' ? shopError(404, 'not_found') : shopError(409, 'conflict', err.code);
    }
    console.error('[shop-api] reserve failed', err);
    return shopError(500, 'internal');
  }
}
