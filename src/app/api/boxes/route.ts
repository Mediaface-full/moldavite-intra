import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const boxes = await prisma.box.findMany({
    include: {
      _count: { select: { items: true } },
      items: {
        take: 4,
        select: { photoPath: true, evidNumber: true },
        orderBy: { evidNumber: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });
  return NextResponse.json(boxes);
}
