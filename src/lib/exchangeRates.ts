import { prisma } from './prisma';
import { getLatestRates } from './rates';

/**
 * Přepočítá EUR a USD cenu pro jeden item na základě aktuálního kurzu.
 * Volá se při změně salePrice nebo ručně tlačítkem.
 */
export async function recalcItemPrices(itemId: number): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { salePrice: true } });
  if (!item) return;

  const priceCZK = Number(item.salePrice);
  const rates = await getLatestRates();

  const eurRate = rates.EUR?.rate || 0;
  const usdRate = rates.USD?.rate || 0;

  const priceEUR = eurRate > 0 ? Math.round(priceCZK / eurRate) : 0;
  const priceUSD = usdRate > 0 ? Math.round(priceCZK / usdRate) : 0;

  await prisma.item.update({
    where: { id: itemId },
    data: { priceEUR, priceUSD },
  });
}

/**
 * Přepočítá EUR a USD ceny pro VŠECHNY kameny podle aktuálního kurzu.
 * Volá se tlačítkem "Přepočítat podle kurzu" u exportu.
 */
export async function recalcAllPrices(): Promise<number> {
  const rates = await getLatestRates();
  const eurRate = rates.EUR?.rate || 0;
  const usdRate = rates.USD?.rate || 0;

  if (eurRate <= 0 && usdRate <= 0) return 0;

  const items = await prisma.item.findMany({
    where: { salePrice: { gt: 0 } },
    select: { id: true, salePrice: true },
  });

  for (const item of items) {
    const priceCZK = Number(item.salePrice);
    await prisma.item.update({
      where: { id: item.id },
      data: {
        priceEUR: eurRate > 0 ? Math.round(priceCZK / eurRate) : 0,
        priceUSD: usdRate > 0 ? Math.round(priceCZK / usdRate) : 0,
      },
    });
  }

  return items.length;
}
