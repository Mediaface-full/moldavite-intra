import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { recalcItemPrices } from '@/lib/pricing';

const ALLOWED_FIELDS = [
  'name', 'nameEn', 'description', 'descriptionEn', 'longDescription', 'longDescriptionEn',
  'location', 'storage', 'purchasePrice', 'salePrice',
  'weight', 'onShop', 'onEtsy', 'sold', 'mainPhoto', 'upgatesId', 'etsyId',
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id: parseInt(id) },
    include: { box: true },
  });

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Whitelist fields
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  // Admin-only fields
  if (session.role !== 'ADMIN') {
    delete data.purchasePrice;
  }

  // Validate: can't enable shop/etsy without weight and price
  if (data.onShop === true || data.onEtsy === true) {
    const existing = await prisma.item.findUnique({ where: { id: parseInt(id) } });
    if (existing) {
      const weight = Number(existing.weight);
      const price = Number(existing.salePrice);
      if (weight <= 0 || price <= 0) {
        return NextResponse.json(
          { error: 'Nelze vystavit na shop bez hmotnosti a prodejní ceny' },
          { status: 400 }
        );
      }
      if (existing.sold) {
        return NextResponse.json(
          { error: 'Nelze vystavit prodaný kámen' },
          { status: 400 }
        );
      }
    }
  }

  const itemId = parseInt(id);
  await prisma.item.update({
    where: { id: itemId },
    data,
  });

  // Recalc ct when weight changes (1g = 5ct)
  if (data.weight !== undefined) {
    const weightG = Number(data.weight);
    await prisma.item.update({
      where: { id: itemId },
      data: { weightCt: Math.round(weightG * 5 * 100) / 100 },
    });
  }

  // Recalc EUR/USD when sale price changes
  if (data.salePrice !== undefined) {
    await recalcItemPrices(itemId);
  }

  await logActivity(session.id, 'item.update', `${id}`, JSON.stringify(data));

  const updated = await prisma.item.findUnique({ where: { id: itemId } });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  await prisma.item.delete({ where: { id: parseInt(id) } });
  await logActivity(session.id, 'item.delete', id);
  return NextResponse.json({ success: true });
}
