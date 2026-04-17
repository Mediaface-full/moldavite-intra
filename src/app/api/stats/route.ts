import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const dateFrom = sp.get('from') || '';
  const dateTo = sp.get('to') || '';

  // Date filters for sold items
  const soldDateFilter: Record<string, unknown> = { sold: true };
  if (dateFrom || dateTo) {
    soldDateFilter.updatedAt = {};
    if (dateFrom) (soldDateFilter.updatedAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (soldDateFilter.updatedAt as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59');
  }

  const [
    totalItems,
    totalBoxes,
    soldItems,
    onShopItems,
    onEtsyItems,
    unsoldItems,
    noPrice,
    noWeight,
    noDescription,
    soldItemsList,
    allItems,
    boxStats,
  ] = await Promise.all([
    prisma.item.count(),
    prisma.box.count(),
    prisma.item.count({ where: soldDateFilter }),
    prisma.item.count({ where: { onShop: true, sold: false } }),
    prisma.item.count({ where: { onEtsy: true, sold: false } }),
    prisma.item.count({ where: { sold: false } }),
    prisma.item.count({ where: { salePrice: { equals: 0 }, sold: false } }),
    prisma.item.count({ where: { weight: { equals: 0 }, sold: false } }),
    prisma.item.count({ where: { description: '', sold: false } }),
    // Sold items with details
    prisma.item.findMany({
      where: soldDateFilter,
      include: { box: { select: { code: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    // All items for aggregations
    prisma.item.findMany({
      select: { salePrice: true, purchasePrice: true, weight: true, sold: true },
    }),
    // Per-box stats
    prisma.box.findMany({
      include: {
        _count: { select: { items: true } },
        items: {
          select: { sold: true, salePrice: true, purchasePrice: true, weight: true, onShop: true, onEtsy: true },
        },
      },
      orderBy: { code: 'asc' },
    }),
  ]);

  // Aggregate calculations
  const totalSaleValue = allItems.filter(i => !i.sold).reduce((sum, i) => sum + Number(i.salePrice), 0);
  const totalPurchaseValue = allItems.filter(i => !i.sold).reduce((sum, i) => sum + Number(i.purchasePrice), 0);
  const totalWeight = allItems.filter(i => !i.sold).reduce((sum, i) => sum + Number(i.weight), 0);
  const soldRevenue = soldItemsList.reduce((sum, i) => sum + Number(i.salePrice), 0);
  const soldCost = soldItemsList.reduce((sum, i) => sum + Number(i.purchasePrice), 0);
  const soldProfit = soldRevenue - soldCost;
  const avgPricePerGram = totalWeight > 0 ? totalSaleValue / totalWeight : 0;

  // Weight distribution
  const weightRanges = [
    { label: '0-1g', min: 0, max: 1 },
    { label: '1-3g', min: 1, max: 3 },
    { label: '3-5g', min: 3, max: 5 },
    { label: '5-10g', min: 5, max: 10 },
    { label: '10-20g', min: 10, max: 20 },
    { label: '20g+', min: 20, max: 99999 },
  ];

  const weightDistribution = weightRanges.map(r => ({
    label: r.label,
    count: allItems.filter(i => !i.sold && Number(i.weight) > r.min && Number(i.weight) <= r.max).length,
  }));

  // Box breakdown
  const boxBreakdown = boxStats.map(box => ({
    code: box.code,
    total: box._count.items,
    sold: box.items.filter(i => i.sold).length,
    onShop: box.items.filter(i => i.onShop && !i.sold).length,
    onEtsy: box.items.filter(i => i.onEtsy && !i.sold).length,
    inStock: box.items.filter(i => !i.sold).length,
    totalWeight: box.items.filter(i => !i.sold).reduce((s, i) => s + Number(i.weight), 0),
    totalValue: box.items.filter(i => !i.sold).reduce((s, i) => s + Number(i.salePrice), 0),
  }));

  // Monthly sales chart - last 12 months
  const monthlyData: Array<{ month: string; count: number; revenue: number; profit: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = `${d.getMonth() + 1}/${d.getFullYear()}`;

    const monthSold = soldItemsList.filter(item => {
      const u = new Date(item.updatedAt);
      return u >= monthStart && u <= monthEnd;
    });

    monthlyData.push({
      month: label,
      count: monthSold.length,
      revenue: monthSold.reduce((s, i) => s + Number(i.salePrice), 0),
      profit: monthSold.reduce((s, i) => s + Number(i.salePrice) - Number(i.purchasePrice), 0),
    });
  }

  // Serialize sold items
  const soldList = soldItemsList.map(item => ({
    id: item.id,
    catalogNumber: `${item.box.code}-${item.evidNumber}`,
    salePrice: Number(item.salePrice),
    purchasePrice: Number(item.purchasePrice),
    profit: Number(item.salePrice) - Number(item.purchasePrice),
    weight: Number(item.weight),
    soldAt: item.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    overview: {
      totalItems,
      totalBoxes,
      inStock: unsoldItems,
      sold: soldItems,
      onShop: onShopItems,
      onEtsy: onEtsyItems,
      noPrice,
      noWeight,
      noDescription,
    },
    financial: {
      totalSaleValue: Math.round(totalSaleValue),
      totalPurchaseValue: Math.round(totalPurchaseValue),
      potentialProfit: Math.round(totalSaleValue - totalPurchaseValue),
      soldRevenue: Math.round(soldRevenue),
      soldCost: Math.round(soldCost),
      soldProfit: Math.round(soldProfit),
      avgPricePerGram: Math.round(avgPricePerGram),
    },
    inventory: {
      totalWeight: Math.round(totalWeight * 100) / 100,
      weightDistribution,
    },
    monthlyData,
    boxBreakdown,
    soldList,
  });
}
