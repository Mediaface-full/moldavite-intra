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

  return NextResponse.json({ logs, total });
}
