import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { serializeCost } from '@/lib/orders/serialize';

const ALLOWED_FIELDS = [
  'typeKey', 'label', 'allocationMethodOverride',
  'amountSource', 'amountCzk', 'currency',
  'exchangeRate', 'exchangeRateDate', 'note',
];
const ALLOWED_METHODS = ['BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE'];
const ALLOWED_TYPE_KEYS = ['transport', 'photo', 'packing', 'storage', 'fees', 'customs', 'work', 'other'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; costId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, costId } = await params;
  const orderId = parseInt(id, 10);
  const cId = parseInt(costId, 10);
  if (Number.isNaN(orderId) || Number.isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await prisma.orderCostItem.findUnique({ where: { id: cId }, include: { order: { select: { code: true } } } });
  if (!existing || existing.orderId !== orderId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (data.typeKey !== undefined && !ALLOWED_TYPE_KEYS.includes(data.typeKey as string)) {
    return NextResponse.json({ error: `typeKey musí být ${ALLOWED_TYPE_KEYS.join('/')}` }, { status: 422 });
  }
  if (data.allocationMethodOverride !== undefined && data.allocationMethodOverride !== null) {
    if (!ALLOWED_METHODS.includes(data.allocationMethodOverride as string)) {
      return NextResponse.json({ error: `allocationMethodOverride musí být ${ALLOWED_METHODS.join('/')}` }, { status: 422 });
    }
  }
  if (data.amountCzk !== undefined) {
    const a = Number(data.amountCzk);
    if (!Number.isFinite(a) || a < 0) return NextResponse.json({ error: 'amountCzk nesmí být záporné' }, { status: 422 });
  }
  if (data.exchangeRateDate) data.exchangeRateDate = new Date(data.exchangeRateDate as string);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.orderCostItem.update({ where: { id: cId }, data: data as never });
    await tx.item.updateMany({
      where: { orderId, pricingStatus: 'OK' },
      data: { pricingStatus: 'STALE' },
    });
    return u;
  });

  await logActivity(session.id, 'order.cost.update', existing.order.code, JSON.stringify({ costId: cId, fields: Object.keys(data) }));
  return NextResponse.json(serializeCost(updated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; costId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, costId } = await params;
  const orderId = parseInt(id, 10);
  const cId = parseInt(costId, 10);
  if (Number.isNaN(orderId) || Number.isNaN(cId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await prisma.orderCostItem.findUnique({ where: { id: cId }, include: { order: { select: { code: true } } } });
  if (!existing || existing.orderId !== orderId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.orderCostItem.delete({ where: { id: cId } });
    await tx.item.updateMany({
      where: { orderId, pricingStatus: 'OK' },
      data: { pricingStatus: 'STALE' },
    });
  });

  await logActivity(session.id, 'order.cost.delete', existing.order.code, JSON.stringify({ costId: cId, typeKey: existing.typeKey }));
  return NextResponse.json({ success: true });
}
