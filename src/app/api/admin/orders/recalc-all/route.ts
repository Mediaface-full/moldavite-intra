/**
 * POST /api/admin/orders/recalc-all — ADMIN
 *
 * Přepočítá cenotvorbu VŠECH aktivních zakázek (DRAFT / PRICED / PUBLISHED) stejným
 * modulem jako „Přepočítat" na jedné zakázce (`lib/orders/recalcOrder`). Použití: po změně
 * globálních pravidel nebo sazby DPH — 12. 10. 2026 přechod na 0 % (firma není plátce DPH),
 * migrace `20261012200000_vat_default_zero` sazbu přepsala, ceny kamenů dopočítá až tohle.
 * CANCELLED / ARCHIVED se nepřepočítávají (historický snapshot).
 * Tlačítko: Admin → Cenotvorba. CSRF + cookie session jako ostatní /api/admin.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { recalcOrder } from '@/lib/orders/recalcOrder';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orders = await prisma.order.findMany({
    where: { status: { in: ['DRAFT', 'PRICED', 'PUBLISHED'] } },
    select: { id: true, code: true },
    orderBy: { id: 'asc' },
  });

  const done: string[] = [];
  const failed: { code: string; error: string }[] = [];
  for (const o of orders) {
    try {
      await recalcOrder(o.id);
      done.push(o.code);
    } catch (err) {
      console.error(`[recalc-all] zakázka ${o.code} selhala:`, err);
      failed.push({ code: o.code, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await logActivity(
    session.id,
    'order.recalculate_all',
    'orders',
    `${done.length}/${orders.length} zakázek přepočítáno${failed.length ? `, selhalo: ${failed.map((f) => f.code).join(', ')}` : ''}`,
  );

  return NextResponse.json({ total: orders.length, done, failed });
}
