import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';
import { buildItemParams, attrDictKey, type AttrDict } from '@/lib/exportParams';

/**
 * XML escaping (audit 10. 9. 2026): name/nameEn/location/upgatesId/popisy jsou
 * USER-editovatelná pole — bez escapování stačí `&` nebo `<` v názvu a celý
 * Upgates feed přestane být well-formed (import na e-shopu selže), případně
 * `]]>` v popisu vyskočí z CDATA a vloží vlastní elementy (cena apod.).
 */
function xmlEsc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function cdata(v: unknown): string {
  // `]]>` uvnitř CDATA se rozdělí na dva CDATA bloky — obsah zůstane 1:1.
  return `<![CDATA[${String(v ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [items, config, attrOptions] = await Promise.all([
    prisma.item.findMany({
      where: { onShop: true, sold: false },
      include: { box: true },
      orderBy: { evidNumber: 'asc' },
    }),
    prisma.exportConfig.findUnique({ where: { exportType: 'upgates' } }),
    // Číselník pro CZ/EN labely parametrů (jednou, ne per kámen).
    prisma.attrOption.findMany({ select: { attrKey: true, value: true, label: true, labelEn: true } }),
  ]);
  const attrDict: AttrDict = {};
  for (const o of attrOptions) attrDict[attrDictKey(o.attrKey, o.value)] = { label: o.label, labelEn: o.labelEn };

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
    // WebP (14. 9. 2026): Upgates WebP podporuje (JPG/PNG/WebP/SVG). Soubory
    // .webp na disku nejsou — /images route je vyrobí on-demand z .jpg a kešuje
    // (viz lib/imageFormats.ts). Etsy export zůstává .jpg (Etsy WebP nebere).
    const imageUrl = `${baseUrl}/images/${item.photoPath}/${mainPhotoNum}.webp`;
    const images360 = Array.from({ length: 24 }, (_, i) =>
      `${baseUrl}/images/${item.photoPath}/${String(i + 1).padStart(2, '0')}.webp`
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
    xml += `    <ITEM_ID>${xmlEsc(itemId)}</ITEM_ID>\n`;
    const productName = primaryLang === 'en'
      ? (item.nameEn || `Moldavite ${catalogNumber}`)
      : (item.name || `Moldavit ${catalogNumber}`);
    const desc = primaryLang === 'en'
      ? (item.longDescriptionEn || item.descriptionEn || item.longDescription || item.description)
      : (item.longDescription || item.description);

    // Prepend "Tvar: X / Y" paragraph to the description if shape is set.
    const shape = getPasShape(item.pasShape);
    const shapeLineCz = shape ? `<p><strong>Tvar:</strong> ${shape.cz} / ${shape.en}</p>` : '';
    const shapeLineEn = shape ? `<p><strong>Shape:</strong> ${shape.en} / ${shape.cz}</p>` : '';
    const primaryShapeLine = primaryLang === 'en' ? shapeLineEn : shapeLineCz;
    const descWithShape = primaryShapeLine + (desc || '');

    xml += `    <PRODUCTNAME>${xmlEsc(productName)}</PRODUCTNAME>\n`;
    xml += `    <DESCRIPTION>${cdata(descWithShape)}</DESCRIPTION>\n`;

    // Second language variant
    if (languages.length > 1) {
      const otherLang = languages.find(l => l !== primaryLang) || 'en';
      const altName = otherLang === 'en' ? (item.nameEn || '') : (item.name || '');
      const altDesc = otherLang === 'en'
        ? (item.longDescriptionEn || item.descriptionEn || '')
        : (item.longDescription || item.description || '');
      const altShapeLine = otherLang === 'en' ? shapeLineEn : shapeLineCz;
      const altDescWithShape = altShapeLine + (altDesc || '');
      if (altName) xml += `    <PRODUCTNAME_ALT>${cdata(altName)}</PRODUCTNAME_ALT>\n`;
      if (altDescWithShape) xml += `    <DESCRIPTION_ALT>${cdata(altDescWithShape)}</DESCRIPTION_ALT>\n`;
    }
    xml += `    <PRICE>${price}</PRICE>\n`;
    xml += `    <PRICE_VAT>${price}</PRICE_VAT>\n`;
    xml += `    <CURRENCYID>${primaryCurrency}</CURRENCYID>\n`;
    xml += `    <VAT>0</VAT>\n`;
    xml += `    <ITEM_TYPE>product</ITEM_TYPE>\n`;
    xml += `    <WEIGHT>${xmlEsc(item.weight)}</WEIGHT>\n`;
    xml += `    <CATEGORYTEXT>Moldavity</CATEGORYTEXT>\n`;
    xml += `    <MANUFACTURER>Bohemian Moldavite</MANUFACTURER>\n`;
    xml += `    <IMGURL>${xmlEsc(imageUrl)}</IMGURL>\n`;

    for (const img of images360) {
      xml += `    <IMGURL_ALTERNATIVE>${xmlEsc(img)}</IMGURL_ALTERNATIVE>\n`;
    }

    if (item.photoPath) {
      xml += `    <VIDEO_URL>${xmlEsc(`${baseUrl}/images/${item.photoPath}/video.mp4`)}</VIDEO_URL>\n`;
    }

    xml += `    <EAN>${xmlEsc(catalogNumber)}</EAN>\n`;

    // Parametry (filtry e-shopu) — spec docs/ESHOP-PARAMETRY.md, obě jazykové
    // sady vedle sebe (CZ + EN), bez certifikátu. Logika v lib/exportParams.ts.
    for (const p of buildItemParams(item, attrDict)) {
      xml += `    <PARAM><PARAM_NAME>${xmlEsc(p.name)}</PARAM_NAME><VAL>${xmlEsc(p.value)}</VAL></PARAM>\n`;
    }
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
