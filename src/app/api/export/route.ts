import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [items, config] = await Promise.all([
    prisma.item.findMany({
      where: { onShop: true, sold: false },
      include: { box: true },
      orderBy: { evidNumber: 'asc' },
    }),
    prisma.exportConfig.findUnique({ where: { exportType: 'upgates' } }),
  ]);

  const primaryCurrency = config?.primaryCurrency || 'CZK';
  const commission = Number(config?.commission || 0);
  const primaryLang = (config as { primaryLanguage?: string })?.primaryLanguage || 'cz';
  const languages = (config as { languages?: string[] })?.languages || ['cz'];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost';

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<SHOP>\n';

  for (const item of items) {
    const catalogNumber = `${item.box.code}-${item.evidNumber}`;
    const mainPhotoNum = String(item.mainPhoto || 1).padStart(2, '0');
    const imageUrl = `${baseUrl}/images/${item.photoPath}/${mainPhotoNum}.jpg`;
    const images360 = Array.from({ length: 24 }, (_, i) =>
      `${baseUrl}/images/${item.photoPath}/${String(i + 1).padStart(2, '0')}.jpg`
    );

    // Pick price based on primary currency (from pre-calculated DB fields)
    const priceCZK = Number(item.salePrice);
    let price: number;
    if (primaryCurrency === 'EUR') {
      price = Number(item.priceEUR) || 0;
    } else if (primaryCurrency === 'USD') {
      price = Number(item.priceUSD) || 0;
    } else {
      price = priceCZK;
    }

    // Apply commission
    if (commission > 0) {
      price = Math.round(price * (1 + commission / 100));
    }

    const itemId = item.upgatesId || catalogNumber;
    xml += '  <SHOPITEM>\n';
    xml += `    <ITEM_ID>${itemId}</ITEM_ID>\n`;
    const productName = primaryLang === 'en'
      ? (item.nameEn || `Moldavite ${catalogNumber}`)
      : (item.name || `Moldavit ${catalogNumber}`);
    const desc = primaryLang === 'en'
      ? (item.longDescriptionEn || item.descriptionEn || item.longDescription || item.description)
      : (item.longDescription || item.description);

    xml += `    <PRODUCTNAME>${productName}</PRODUCTNAME>\n`;
    xml += `    <DESCRIPTION><![CDATA[${desc}]]></DESCRIPTION>\n`;

    // Second language variant
    if (languages.length > 1) {
      const otherLang = languages.find(l => l !== primaryLang) || 'en';
      const altName = otherLang === 'en' ? (item.nameEn || '') : (item.name || '');
      const altDesc = otherLang === 'en'
        ? (item.longDescriptionEn || item.descriptionEn || '')
        : (item.longDescription || item.description || '');
      if (altName) xml += `    <PRODUCTNAME_ALT><![CDATA[${altName}]]></PRODUCTNAME_ALT>\n`;
      if (altDesc) xml += `    <DESCRIPTION_ALT><![CDATA[${altDesc}]]></DESCRIPTION_ALT>\n`;
    }
    xml += `    <PRICE>${price}</PRICE>\n`;
    xml += `    <PRICE_VAT>${price}</PRICE_VAT>\n`;
    xml += `    <CURRENCYID>${primaryCurrency}</CURRENCYID>\n`;
    xml += `    <VAT>0</VAT>\n`;
    xml += `    <ITEM_TYPE>product</ITEM_TYPE>\n`;
    xml += `    <WEIGHT>${item.weight}</WEIGHT>\n`;
    xml += `    <CATEGORYTEXT>Moldavity</CATEGORYTEXT>\n`;
    xml += `    <MANUFACTURER>Bohemian Moldavite</MANUFACTURER>\n`;
    xml += `    <IMGURL>${imageUrl}</IMGURL>\n`;

    for (const img of images360) {
      xml += `    <IMGURL_ALTERNATIVE>${img}</IMGURL_ALTERNATIVE>\n`;
    }

    if (item.photoPath) {
      xml += `    <VIDEO_URL>${baseUrl}/images/${item.photoPath}/video.mp4</VIDEO_URL>\n`;
    }

    // All prices as params
    if (priceCZK > 0) {
      xml += `    <PARAM><PARAM_NAME>Cena CZK</PARAM_NAME><VAL>${priceCZK} CZK</VAL></PARAM>\n`;
    }
    if (Number(item.priceEUR) > 0) {
      xml += `    <PARAM><PARAM_NAME>Cena EUR</PARAM_NAME><VAL>${item.priceEUR} EUR</VAL></PARAM>\n`;
    }
    if (Number(item.priceUSD) > 0) {
      xml += `    <PARAM><PARAM_NAME>Cena USD</PARAM_NAME><VAL>${item.priceUSD} USD</VAL></PARAM>\n`;
    }

    xml += `    <EAN>${catalogNumber}</EAN>\n`;
    xml += `    <PARAM><PARAM_NAME>Hmotnost</PARAM_NAME><VAL>${item.weight} g</VAL></PARAM>\n`;
    xml += `    <PARAM><PARAM_NAME>Lokalita</PARAM_NAME><VAL>${item.location}</VAL></PARAM>\n`;
    xml += '  </SHOPITEM>\n';
  }

  xml += '</SHOP>\n';

  await logActivity(session.id, 'export.upgates', '', `Export: ${items.length} položek, ${primaryCurrency}, provize ${commission}%`);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'inline; filename="upgates.xml"',
    },
  });
}
