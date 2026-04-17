import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const field = request.nextUrl.searchParams.get('field');

  if (field === 'placement') {
    const boxes = await prisma.box.findMany({
      where: { placement: { not: '' } },
      select: { placement: true },
      distinct: ['placement'],
      orderBy: { placement: 'asc' },
    });
    return NextResponse.json(boxes.map(b => b.placement));
  }

  if (field === 'storage') {
    const items = await prisma.item.findMany({
      where: { storage: { not: '' } },
      select: { storage: true },
      distinct: ['storage'],
      orderBy: { storage: 'asc' },
    });
    return NextResponse.json(items.map(i => i.storage));
  }

  if (field === 'location') {
    const items = await prisma.item.findMany({
      where: { location: { not: '' } },
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    });
    return NextResponse.json(items.map(i => i.location));
  }

  return NextResponse.json([]);
}
