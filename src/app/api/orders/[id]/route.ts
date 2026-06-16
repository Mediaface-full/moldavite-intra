import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { serializeOrder, serializeCost, serializeItemForPricing } from '@/lib/orders/serialize';

// Whitelist polí povolených pro PATCH (uživatelské metadata + cenotvorba).
// status se mění separátní endpointem (přijde v Etapě 3 UI tlačítky).
const ALLOWED_PATCH_FIELDS = [
  'title', 'sellerName', 'sellerContact', 'purchaseDate',
  'declaredPieces', 'declaredWeight', 'originLocality', 'notes',
  'sourceCurrency', 'totalPurchaseAmountSource', 'totalPurchaseAmountCzk',
  'exchangeRate', 'exchangeRateDate',
  'defaultPurchasePricePerGramSource', 'defaultPurchasePricePerGramCzk',
  'allocationMethod', 'vatRatePct', 'roundingStep',
  'pricingConfigId',
  'status',
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      costs: { orderBy: { createdAt: 'asc' } },
      items: { include: { box: { select: { id: true, code: true } } }, orderBy: { evidNumber: 'asc' } },
      boxes: { select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } },
      pricingConfig: true,
      _count: { select: { items: true, costs: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...serializeOrder(order),
    costs: order.costs.map(serializeCost),
    items: order.items.map(serializeItemForPricing),
    boxes: order.boxes,
    pricingConfig: order.pricingConfig,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH_FIELDS) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate as string);
  if (data.exchangeRateDate) data.exchangeRateDate = new Date(data.exchangeRateDate as string);

  // Změna pricingConfigId / cenotvorby = stones jdou do STALE (přepočet potřeba)
  const triggersStale =
    data.allocationMethod !== undefined ||
    data.vatRatePct !== undefined ||
    data.roundingStep !== undefined ||
    data.defaultPurchasePricePerGramCzk !== undefined ||
    data.defaultPurchasePricePerGramSource !== undefined ||
    data.pricingConfigId !== undefined;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({ where: { id: orderId }, data: data as never });
      if (triggersStale) {
        await tx.item.updateMany({
          where: { orderId, pricingStatus: 'OK' },
          data: { pricingStatus: 'STALE' },
        });
      }
      return order;
    });
    await logActivity(session.id, 'order.update', updated.code, JSON.stringify(Object.keys(data)));
    return NextResponse.json(serializeOrder(updated));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { _count: { select: { items: true } } },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (order._count.items > 0) {
    return NextResponse.json(
      {
        error: 'Zakázka má přiřazené kameny — nejdřív je přesuň nebo smaž, nebo použij Storno (status=CANCELLED).',
        itemCount: order._count.items,
      },
      { status: 409 }
    );
  }

  await prisma.order.delete({ where: { id: orderId } });
  await logActivity(session.id, 'order.delete', order.code);
  return NextResponse.json({ success: true });
}
