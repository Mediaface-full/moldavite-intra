/**
 * GET /api/orders/[id]/logs
 *
 * Vrací ActivityLog filtrovaný pro tuto zakázku — události:
 *  - order.* s target = order.code
 *  - box.* s target IN box codes v této zakázce
 *  - item.* s target IN item ids v této zakázce (target je item id, ne kód)
 *  - order.recalculate s target = order.code (přepočet zakázky)
 *
 * Posledních 200 záznamů řazeno DESC podle createdAt. UI dělá lidsky-friendly format.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Načti zakázku + její kazety + kameny pro množinu identifikátorů co filtrovat.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      code: true,
      boxes: { select: { code: true } },
      items: { select: { id: true, evidNumber: true, box: { select: { code: true } } } },
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const boxCodes = order.boxes.map((b) => b.code);
  const itemIds = order.items.map((i) => String(i.id));
  // Mapa item.id → "{boxCode}-{evidNumber}" pro UI display.
  const itemCatalog: Record<string, string> = {};
  for (const it of order.items) {
    itemCatalog[String(it.id)] = `${it.box.code}-${it.evidNumber}`;
  }

  // Filter: action prefix + target match.
  // SQLite/PG: prisma OR clause se třemi větvemi (order/box/item).
  const logs = await prisma.activityLog.findMany({
    where: {
      OR: [
        { AND: [{ action: { startsWith: 'order.' } }, { target: order.code }] },
        ...(boxCodes.length > 0 ? [{ AND: [{ action: { startsWith: 'box.' } }, { target: { in: boxCodes } }] }] : []),
        ...(itemIds.length > 0 ? [{ AND: [{ action: { startsWith: 'item.' } }, { target: { in: itemIds } }] }] : []),
      ],
    },
    include: {
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      target: l.target,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
      user: l.user ? { email: l.user.email, name: l.user.name } : null,
      // Pro item.* logs nahraď target z item id na katalogové číslo (K0001-0005).
      targetDisplay: l.action.startsWith('item.') && itemCatalog[l.target]
        ? itemCatalog[l.target]
        : l.target,
    })),
  });
}
