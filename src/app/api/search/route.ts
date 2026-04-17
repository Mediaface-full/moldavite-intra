import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  const query = sp.get('q') || '';
  const boxCode = sp.get('box') || '';
  const weightMin = sp.get('weightMin') ? parseFloat(sp.get('weightMin')!) : null;
  const weightMax = sp.get('weightMax') ? parseFloat(sp.get('weightMax')!) : null;
  const priceMin = sp.get('priceMin') ? parseFloat(sp.get('priceMin')!) : null;
  const priceMax = sp.get('priceMax') ? parseFloat(sp.get('priceMax')!) : null;
  const sold = sp.get('sold');
  const onShop = sp.get('onShop');
  const onEtsy = sp.get('onEtsy');
  const hasDescription = sp.get('hasDescription');
  const noPrice = sp.get('noPrice');
  const noWeight = sp.get('noWeight');
  const sortBy = sp.get('sortBy') || 'evidNumber';
  const sortDir = sp.get('sortDir') || 'asc';

  const conditions: Prisma.ItemWhereInput[] = [];

  // Text search: evid number, description, location, catalog number
  if (query) {
    conditions.push({
      OR: [
        { evidNumber: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { location: { contains: query, mode: 'insensitive' } },
        { storage: { contains: query, mode: 'insensitive' } },
        { box: { code: { contains: query, mode: 'insensitive' } } },
      ],
    });
  }

  // Box filter
  if (boxCode) {
    conditions.push({ box: { code: { contains: boxCode, mode: 'insensitive' } } });
  }

  // Weight range
  if (weightMin !== null) {
    conditions.push({ weight: { gte: weightMin } });
  }
  if (weightMax !== null) {
    conditions.push({ weight: { lte: weightMax } });
  }

  // Price range (sale price)
  if (priceMin !== null) {
    conditions.push({ salePrice: { gte: priceMin } });
  }
  if (priceMax !== null) {
    conditions.push({ salePrice: { lte: priceMax } });
  }

  // Sold filter
  if (sold === 'true') conditions.push({ sold: true });
  if (sold === 'false') conditions.push({ sold: false });

  // Eshop/Etsy filters
  if (onShop === 'true') conditions.push({ onShop: true });
  if (onShop === 'false') conditions.push({ onShop: false });
  if (onEtsy === 'true') conditions.push({ onEtsy: true });
  if (onEtsy === 'false') conditions.push({ onEtsy: false });

  // Has description
  if (hasDescription === 'true') {
    conditions.push({ description: { not: '' } });
  }
  if (hasDescription === 'false') {
    conditions.push({ description: '' });
  }

  // Missing price
  if (noPrice === 'true') {
    conditions.push({ salePrice: { equals: 0 } });
  }

  // Missing weight
  if (noWeight === 'true') {
    conditions.push({ weight: { equals: 0 } });
  }

  // Build orderBy
  const orderByMap: Record<string, Prisma.ItemOrderByWithRelationInput> = {
    evidNumber: { evidNumber: sortDir as 'asc' | 'desc' },
    weight: { weight: sortDir as 'asc' | 'desc' },
    salePrice: { salePrice: sortDir as 'asc' | 'desc' },
    purchasePrice: { purchasePrice: sortDir as 'asc' | 'desc' },
    box: { box: { code: sortDir as 'asc' | 'desc' } },
    createdAt: { createdAt: sortDir as 'asc' | 'desc' },
  };

  const items = await prisma.item.findMany({
    where: conditions.length > 0 ? { AND: conditions } : undefined,
    include: { box: { select: { code: true, id: true } } },
    orderBy: orderByMap[sortBy] || { evidNumber: 'asc' },
    take: 500,
  });

  // Group by box for structured output
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const code = item.box.code;
    if (!grouped[code]) grouped[code] = [];
    grouped[code].push(item);
  }

  return NextResponse.json({
    total: items.length,
    items,
    grouped,
  });
}
