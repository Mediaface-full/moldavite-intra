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
  const itemCodeRaw = (sp.get('itemCode') || '').trim();

  // Search podle katalogového čísla kamene (K0001-0005, K0001 0005, k0001-5, …).
  // Parse → najdi item podle box.code + evidNumber → filter target = item.id (+ box.code = filter box.* logy).
  let itemIdFilter: number | null = null;
  let boxCodeFilter: string | null = null;
  if (itemCodeRaw) {
    // Akceptuje různé separátory: „K0001-0005", „K0001 0005", „K0001/0005"
    const m = itemCodeRaw.match(/^([A-Za-z]\d+)\s*[-_/\s]\s*(\d+)$/);
    if (m) {
      const boxCode = m[1].toUpperCase();
      const evidNumber = m[2].padStart(4, '0');
      const found = await prisma.item.findFirst({
        where: { box: { code: boxCode }, evidNumber },
        select: { id: true, box: { select: { code: true } } },
      });
      if (found) {
        itemIdFilter = found.id;
        boxCodeFilter = found.box.code;
      } else {
        // Item nenalezen → vrat prazdny vysledek
        return NextResponse.json({ logs: [], total: 0, notFound: `Kámen ${itemCodeRaw} nenalezen` });
      }
    } else if (/^[A-Za-z]\d+$/.test(itemCodeRaw)) {
      // Jen kód kazety bez evidNumber — vrať VŠECHNY logy té kazety + jejích kamenů
      boxCodeFilter = itemCodeRaw.toUpperCase();
      const box = await prisma.box.findFirst({ where: { code: boxCodeFilter }, select: { id: true } });
      if (!box) {
        return NextResponse.json({ logs: [], total: 0, notFound: `Kazeta ${itemCodeRaw} nenalezena` });
      }
    } else {
      return NextResponse.json({ logs: [], total: 0, notFound: `Neplatný kód „${itemCodeRaw}" — použij např. K0001-0005 nebo K0001` });
    }
  }

  // Compose WHERE clause
  const whereParts: Array<Record<string, unknown>> = [];
  if (actionFilter) {
    whereParts.push({ action: { startsWith: actionFilter } });
  }
  if (itemIdFilter !== null) {
    // Konkrétní kámen: jeho logy (target = id) + jeho kazety (target = boxCode).
    whereParts.push({
      OR: [
        { AND: [{ action: { startsWith: 'item.' } }, { target: String(itemIdFilter) }] },
        ...(boxCodeFilter ? [{ AND: [{ action: { startsWith: 'box.' } }, { target: boxCodeFilter }] }] : []),
      ],
    });
  } else if (boxCodeFilter) {
    // Jen kazeta — pro všechny její kameny musíme dohledat IDs
    const items = await prisma.item.findMany({
      where: { box: { code: boxCodeFilter } },
      select: { id: true },
    });
    const itemIds = items.map((it) => String(it.id));
    whereParts.push({
      OR: [
        { AND: [{ action: { startsWith: 'box.' } }, { target: boxCodeFilter }] },
        ...(itemIds.length > 0 ? [{ AND: [{ action: { startsWith: 'item.' } }, { target: { in: itemIds } }] }] : []),
      ],
    });
  }

  const where = whereParts.length === 0 ? {} : whereParts.length === 1 ? whereParts[0] : { AND: whereParts };

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
