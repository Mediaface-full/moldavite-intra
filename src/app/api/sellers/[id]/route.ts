import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

const ALLOWED_PATCH = ['firstName', 'lastName', 'alias', 'phone', 'email', 'note', 'active'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sellerId = parseInt(id, 10);
  if (Number.isNaN(sellerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: {
      orders: { select: { id: true, code: true, title: true, purchaseDate: true, status: true }, orderBy: { purchaseDate: 'desc' } },
      boxes: { select: { id: true, code: true, name: true, orderId: true }, orderBy: { code: 'asc' } },
    },
  });
  if (!seller) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(seller);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const sellerId = parseInt(id, 10);
  if (Number.isNaN(sellerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const data: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH) if (body[k] !== undefined) data[k] = body[k];

  const updated = await prisma.seller.update({ where: { id: sellerId }, data });
  await logActivity(session.id, 'seller.update', String(sellerId), JSON.stringify(Object.keys(data)));
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const sellerId = parseInt(id, 10);
  if (Number.isNaN(sellerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: { _count: { select: { orders: true, boxes: true } } },
  });
  if (!seller) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (seller._count.orders > 0 || seller._count.boxes > 0) {
    return NextResponse.json({
      error: `Dodavatel je přiřazen k ${seller._count.orders} zakázkám a ${seller._count.boxes} kazetám. Nemůže být smazán. Použij deaktivaci (active=false).`,
    }, { status: 409 });
  }

  await prisma.seller.delete({ where: { id: sellerId } });
  await logActivity(session.id, 'seller.delete', String(sellerId), '');
  return NextResponse.json({ success: true });
}
