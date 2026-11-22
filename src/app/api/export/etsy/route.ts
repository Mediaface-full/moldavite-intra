import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';
import { exportPhotoPaths } from '@/lib/photos/exportPhotos';
import { etsyTags, DEFAULT_ETSY_MATERIALS } from '@/lib/etsy/content';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [items, config] = await Promise.all([
    prisma.item.findMany({
      where: { onEtsy: true, sold: false },
      include: { box: true },
      orderBy: { evidNumber: 'asc' },
    }),
    prisma.exportConfig.findUnique({ where: { exportType: 'etsy' } }),
  ]);

  const primaryCurrency = config?.primaryCurrency || 'EUR';
  const commission = Number(config?.commission || 0);
  const primaryLang = (config as { primaryLanguage?: string })?.primaryLanguage || 'en';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost';

  let csv = 'title,description,price,currency,quantity,tags,materials,image1,image2,image3,image4,image5,sku,weight,weight_unit\n';

  for (const item of items) {
    const catalogNumber = `${item.box.code}-${item.evidNumber}`;
    const sku = item.etsyId || catalogNumber;

    // Pick price from pre-calculated DB field
    let price: number;
    if (primaryCurrency === 'EUR') {
      price = Number(item.priceEUR) || 0;
    } else if (primaryCurrency === 'USD') {
      price = Number(item.priceUSD) || 0;
    } else {
      price = Number(item.salePrice);
    }

    // Apply commission
    if (commission > 0) {
      price = Math.round(price * (1 + commission / 100));
    }

    const title = primaryLang === 'en'
      ? (item.nameEn || `Natural Czech Moldavite ${catalogNumber} - ${item.weight}g`)
      : (item.name || `Moldavit ${catalogNumber} - ${item.weight}g`);
    const baseDesc = primaryLang === 'en'
      ? (item.longDescriptionEn || item.descriptionEn || `Genuine Bohemian Moldavite. Weight: ${item.weight}g.`)
      : (item.longDescription || item.description || `Český moldavit. Hmotnost: ${item.weight}g.`);
    // Prefix shape info when set.
    const shape = getPasShape(item.pasShape);
    const shapePrefix = shape
      ? (primaryLang === 'en' ? `Shape: ${shape.en} / ${shape.cz}\n\n` : `Tvar: ${shape.cz} / ${shape.en}\n\n`)
      : '';
    const desc = shapePrefix + baseDesc;
    // Etsy allows max 13 tags; add shape as one extra tag when set (lowercase, no spaces issue).
    // Štítky sdílené s napojením přes Etsy API (lib/etsy/content.ts) — CSV i API dávají totéž.
    const tags = etsyTags([], shape ? item.pasShape : '').join(',');
    const materials = DEFAULT_ETSY_MATERIALS.join(',');

    // Stejné fotky jako e-shop a Etsy API (max 4, AI verze kde je schválená), .jpg — Etsy WebP nebere.
    // CSV má 5 sloupců obrázků → pátý zůstane prázdný.
    const photos = exportPhotoPaths(item, 'jpg').map((p) => `${baseUrl}/images/${p}`);
    const images = [...photos, '', '', '', '', ''].slice(0, 5);

    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

    csv += [
      esc(title), esc(desc), price, primaryCurrency, 1,
      esc(tags), esc(materials), ...images.map(esc),
      esc(sku), item.weight, 'g',
    ].join(',') + '\n';
  }

  await logActivity(session.id, 'export.etsy', '', `Export: ${items.length} položek, ${primaryCurrency}, provize ${commission}%`);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="etsy_export.csv"',
    },
  });
}
