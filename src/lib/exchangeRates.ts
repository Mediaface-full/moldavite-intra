import { prisma } from './prisma';
import { getLatestRates } from './rates';
import { czkBaseForFx, fxPrices, perUnitRate } from './fx';

/**
 * Přepočítá EUR a USD cenu pro jeden item podle aktuálního kurzu.
 * Základ = finální cena (max(doporučená, speciální)), salePrice jen fallback — viz lib/fx.ts.
 */
export async function recalcItemPrices(itemId: number): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { salePrice: true, finalInternalPriceInclVatCzk: true },
  });
  if (!item) return;

  const rates = await getLatestRates();
  await prisma.item.update({
    where: { id: itemId },
    data: fxPrices(czkBaseForFx(item), rates),
  });
}

/**
 * Přepočítá EUR/USD pro zadané kameny jedním načtením kurzů — volá `recalcOrder` po každém
 * přepočtu zakázky, aby uložené `priceEUR/USD` sledovaly finální cenu (i speciální).
 * Bez kurzů v DB nic nepřepisuje (nenuluje), vrací 0.
 */
export async function recalcFxForItems(itemIds: number[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const rates = await getLatestRates();
  if (perUnitRate(rates, 'EUR') <= 0 && perUnitRate(rates, 'USD') <= 0) return 0;

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, salePrice: true, finalInternalPriceInclVatCzk: true },
  });
  for (const item of items) {
    await prisma.item.update({ where: { id: item.id }, data: fxPrices(czkBaseForFx(item), rates) });
  }
  return items.length;
}

/**
 * Přepočítá EUR a USD ceny pro VŠECHNY kameny podle aktuálního kurzu.
 * Volá se tlačítkem "Přepočítat podle kurzu" u exportu a cronem po stažení kurzů.
 */
export async function recalcAllPrices(): Promise<number> {
  const rates = await getLatestRates();
  if (perUnitRate(rates, 'EUR') <= 0 && perUnitRate(rates, 'USD') <= 0) return 0;

  const items = await prisma.item.findMany({
    where: { OR: [{ salePrice: { gt: 0 } }, { finalInternalPriceInclVatCzk: { gt: 0 } }] },
    select: { id: true, salePrice: true, finalInternalPriceInclVatCzk: true },
  });

  for (const item of items) {
    await prisma.item.update({ where: { id: item.id }, data: fxPrices(czkBaseForFx(item), rates) });
  }

  return items.length;
}
