import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { serializeCost } from '@/lib/orders/serialize';

const ALLOWED_TYPE_KEYS = ['transport', 'photo', 'packing', 'storage', 'fees', 'customs', 'work', 'other'];
const ALLOWED_METHODS = ['BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const costs = await prisma.orderCostItem.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(costs.map(serializeCost));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, code: true } });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  if (!ALLOWED_TYPE_KEYS.includes(body.typeKey)) {
    return NextResponse.json({ error: `typeKey musí být ${ALLOWED_TYPE_KEYS.join('/')}` }, { status: 422 });
  }
  if (typeof body.label !== 'string' || body.label.length === 0) {
    return NextResponse.json({ error: 'label je povinný' }, { status: 422 });
  }
  const amount = Number(body.amountCzk ?? body.amountSource ?? body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount musí být kladné číslo' }, { status: 422 });
  }
  if (body.allocationMethodOverride !== undefined && body.allocationMethodOverride !== null) {
    if (!ALLOWED_METHODS.includes(body.allocationMethodOverride)) {
      return NextResponse.json({ error: `allocationMethodOverride musí být ${ALLOWED_METHODS.join('/')}` }, { status: 422 });
    }
  }

  const cost = await prisma.$transaction(async (tx) => {
    const created = await tx.orderCostItem.create({
      data: {
        orderId,
        typeKey: body.typeKey,
        label: body.label,
        allocationMethodOverride: body.allocationMethodOverride ?? null,
        amountSource: amount,
        amountCzk: Number(body.amountCzk ?? amount),
        currency: body.currency ?? 'CZK',
        exchangeRate: body.exchangeRate ?? null,
        exchangeRateDate: body.exchangeRateDate ? new Date(body.exchangeRateDate) : null,
        note: body.note ?? '',
      },
    });
    // Změna nákladů → kameny jdou do STALE
    await tx.item.updateMany({
      where: { orderId, pricingStatus: 'OK' },
      data: { pricingStatus: 'STALE' },
    });
    return created;
  });

  await logActivity(session.id, 'order.cost.add', order.code, JSON.stringify({ typeKey: cost.typeKey, amountCzk: cost.amountCzk.toString() }));
  return NextResponse.json(serializeCost(cost), { status: 201 });
}
