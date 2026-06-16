import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { generateOrderCode } from '@/lib/orders/codes';
import { serializeOrder } from '@/lib/orders/serialize';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const seller = searchParams.get('seller');
  const search = searchParams.get('q');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (seller) where.sellerName = { contains: seller, mode: 'insensitive' };
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { sellerName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: { _count: { select: { items: true, costs: true } } },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(orders.map(serializeOrder));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {
    code: typeof body.code === 'string' && body.code.length > 0 ? body.code : await generateOrderCode(),
    title: body.title ?? '',
    sellerName: body.sellerName ?? '',
    sellerContact: body.sellerContact ?? '',
    purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
    declaredPieces: typeof body.declaredPieces === 'number' ? body.declaredPieces : 0,
    declaredWeight: body.declaredWeight ?? null,
    originLocality: body.originLocality ?? '',
    notes: body.notes ?? '',
    sourceCurrency: body.sourceCurrency ?? 'CZK',
    totalPurchaseAmountSource: body.totalPurchaseAmountSource ?? 0,
    totalPurchaseAmountCzk: body.totalPurchaseAmountCzk ?? body.totalPurchaseAmountSource ?? 0,
    defaultPurchasePricePerGramSource: body.defaultPurchasePricePerGramSource ?? null,
    defaultPurchasePricePerGramCzk: body.defaultPurchasePricePerGramCzk ?? body.defaultPurchasePricePerGramSource ?? null,
    allocationMethod: body.allocationMethod ?? 'BY_WEIGHT',
    vatRatePct: body.vatRatePct ?? 21,
    roundingStep: typeof body.roundingStep === 'number' ? body.roundingStep : 10,
  };

  try {
    const order = await prisma.order.create({ data: data as never });
    await logActivity(session.id, 'order.create', order.code, JSON.stringify({ title: order.title, sellerName: order.sellerName }));
    return NextResponse.json(serializeOrder(order), { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: `Order s code='${data.code}' už existuje` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
