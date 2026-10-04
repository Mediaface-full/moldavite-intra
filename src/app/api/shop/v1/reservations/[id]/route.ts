/**
 * DELETE /api/shop/v1/reservations/{id} — uvolnění rezervace (odebrání z košíku, vypršení, storno).
 * Idempotentní: 204 i pro už uvolněnou / neexistující rezervaci. Kontrakt: app/docs/SHOP-API.md.
 */
import { NextResponse } from 'next/server';
import { authorizeShop, shopError } from '@/lib/shop/auth';
import { releaseReservation } from '@/lib/shop/reservations';
import { RESERVATION_ID_PATTERN } from '@/lib/shop/validate';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeShop(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!RESERVATION_ID_PATTERN.test(id)) return shopError(422, 'invalid', 'id');

  try {
    await releaseReservation(id);
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[shop-api] release failed', err);
    return shopError(500, 'internal');
  }
}
