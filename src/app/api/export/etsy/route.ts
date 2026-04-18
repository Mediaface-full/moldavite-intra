import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';

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
    const baseTags = 'moldavite,czech moldavite,tektite,natural moldavite,genuine moldavite,raw moldavite,green tektite,bohemian moldavite';
    const tags = shape ? `${baseTags},${shape.en.split('/')[0].trim().toLowerCase()}` : baseTags;
    const materials = 'moldavite,tektite';

    const mainIdx = item.mainPhoto || 1;
    const mainImg = `${baseUrl}/images/${item.photoPath}/${String(mainIdx).padStart(2, '0')}.jpg`;
    const otherImgs = [1, 2, 3, 4, 5, 6].filter(i => i !== mainIdx).slice(0, 4)
      .map(i => `${baseUrl}/images/${item.photoPath}/${String(i).padStart(2, '0')}.jpg`);
    const images = [mainImg, ...otherImgs].slice(0, 5);

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
