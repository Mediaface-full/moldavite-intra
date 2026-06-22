import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { parseBoundedInt } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = parseBoundedInt(sp.get('limit'), 1, 500, 100);
  const offset = parseBoundedInt(sp.get('offset'), 0, 1_000_000, 0);
  const actionFilter = sp.get('action') || '';

  const where = actionFilter
    ? { action: { startsWith: actionFilter } }
    : {};

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.activityLog.count({ where }),
  ]);

  // Enrich item.* logs s katalogovym cislem (K0001-0005) misto raw item id.
  const itemTargets = logs
    .filter((l) => l.action.startsWith('item.'))
    .map((l) => parseInt(l.target, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  const itemCatalog: Record<string, string> = {};
  if (itemTargets.length > 0) {
    const items = await prisma.item.findMany({
      where: { id: { in: itemTargets } },
      select: { id: true, evidNumber: true, box: { select: { code: true } } },
    });
    for (const it of items) {
      itemCatalog[String(it.id)] = `${it.box.code}-${it.evidNumber}`;
    }
  }

  const enriched = logs.map((l) => ({
    ...l,
    targetDisplay: l.action.startsWith('item.') && itemCatalog[l.target]
      ? itemCatalog[l.target]
      : l.target,
  }));

  return NextResponse.json({ logs: enriched, total });
}
