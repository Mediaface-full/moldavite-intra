import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const rawBoxId = searchParams.get('boxId');
  const pasShape = searchParams.get('pasShape');

  const where: Record<string, unknown> = {};
  if (rawBoxId) {
    const boxId = parsePositiveInt(rawBoxId);
    if (boxId === null) {
      return NextResponse.json({ error: 'Invalid boxId' }, { status: 400 });
    }
    where.boxId = boxId;
  }
  if (pasShape) {
    where.pasShape = pasShape;
  }

  const items = await prisma.item.findMany({
    where,
    include: { box: { select: { code: true } } },
    orderBy: { evidNumber: 'asc' },
    take: 1000,
  });

  return NextResponse.json(items);
}
