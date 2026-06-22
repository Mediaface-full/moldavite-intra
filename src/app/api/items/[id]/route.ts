import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { recalcItemPrices } from '@/lib/exchangeRates';
import { resolvePpg } from '@/lib/pricing/resolve';
import { captureItemSaleSnapshot } from '@/lib/orders/captureItemSaleSnapshot';

const ALLOWED_FIELDS = [
  'name', 'nameEn', 'description', 'descriptionEn', 'longDescription', 'longDescriptionEn',
  'location', 'storage', 'purchasePrice', 'salePrice',
  'weight', 'onShop', 'onEtsy', 'sold', 'mainPhoto', 'upgatesId', 'etsyId',
  'pasShape',
  // Etapa 2/3 — cenotvorba per-item:
  'orderId', 'purchasePricePerGramCzk', 'purchasePricePerGramSource',
  'manualPriceInclVatCzk',
  'attrDamage', 'attrColor', 'attrCollectible',
];

function parseItemId(id: string): number | null {
  const n = Number.parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = parseItemId(id);
  if (itemId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const item = await prisma.item.findUnique({
    where: { id: itemId },
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
  const itemId = parseItemId(id);
  if (itemId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
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
    const existing = await prisma.item.findUnique({ where: { id: itemId } });
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
      // Gate na pricing status — kamen k revizi / bez vstupu nesmi byt na shopu.
      // STALE projde (signal „klikni Prepocitat", ne data error).
      if (existing.pricingStatus === 'NEEDS_INPUT' || existing.pricingStatus === 'NEEDS_REVIEW') {
        const reason = existing.pricingStatus === 'NEEDS_INPUT'
          ? 'kameni chybí vstupy pro cenu (váha nebo Kč/g)'
          : 'kámen má nevyplněná povinná evidenční pole nebo speciální cenu pod doporučenou';
        return NextResponse.json(
          { error: `Nelze vystavit kámen ve stavu ${existing.pricingStatus} — ${reason}. Dopiš chybějící údaje a spusť Přepočítat.` },
          { status: 400 }
        );
      }
    }
  }

  // Etapa 2: manualPriceInclVatCzk → pokud spadla pod recommended, označ NEEDS_REVIEW
  // (ale neblokuj — uživatel může vědomě jít pod minimum, jen mu to flagujeme).
  if (data.manualPriceInclVatCzk !== undefined) {
    let manual: number | null;
    if (data.manualPriceInclVatCzk === null || data.manualPriceInclVatCzk === '') {
      manual = null;
    } else {
      const n = Number(data.manualPriceInclVatCzk);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'manualPriceInclVatCzk musí být ≥ 0 a finite' }, { status: 422 });
      }
      manual = n;
    }
    data.manualPriceInclVatCzk = manual;
    const existing = await prisma.item.findUnique({ where: { id: itemId }, select: { recommendedPriceInclVatCzk: true } });
    const recommended = existing?.recommendedPriceInclVatCzk ? Number(existing.recommendedPriceInclVatCzk) : null;
    if (manual !== null && recommended !== null && manual < recommended) {
      data.pricingStatus = 'NEEDS_REVIEW';
      data.finalInternalPriceInclVatCzk = recommended; // safe fallback
    } else if (manual !== null && recommended !== null && manual >= recommended) {
      data.pricingStatus = 'OK';
      data.finalInternalPriceInclVatCzk = manual;
    } else if (manual === null && recommended !== null) {
      data.pricingStatus = 'OK';
      data.finalInternalPriceInclVatCzk = recommended;
    } else if (manual !== null && recommended === null) {
      // Edge case: uživatel zadal speciální cenu PŘED prvním recalc Order
      // → manual je jediná smysluplná hodnota
      data.pricingStatus = 'OK';
      data.finalInternalPriceInclVatCzk = manual;
    } else if (manual === null && recommended === null) {
      // Edge case: smazal speciální, žádná recommended ještě není
      // → vyčistit final, status zpět na NEEDS_INPUT
      data.pricingStatus = 'NEEDS_INPUT';
      data.finalInternalPriceInclVatCzk = null;
    }
  }

  // Auto-update Item.purchasePrice když user změnil weight nebo PPG override.
  // Není to plný recalc (alokace + margin + DPH potřebují všechny items zakázky),
  // ale „Cena nákupní" v sekci Ceny se okamžitě objeví bez nutnosti Přepočítat.
  // Plus označíme status STALE — signál uživateli „klikni Přepočítat pro úplné ceny".
  //
  // Pozor: UI vždy posílá purchasePrice v PATCH (formData submission). Auto-update
  // nesmí přepsat user input — pokud poslaná hodnota se liší od DB, user ji ručně
  // změnil a respektujeme to.
  const affectsPurchase =
    data.weight !== undefined ||
    data.purchasePricePerGramCzk !== undefined ||
    data.purchasePricePerGramSource !== undefined;
  if (affectsPurchase) {
    const ctx = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        box: { select: { purchasePricePerGramCzk: true, purchaseAmountCzk: true, declaredWeight: true } },
        order: { select: { defaultPurchasePricePerGramCzk: true } },
      },
    });
    if (ctx) {
      // Detekce: user explicitně přepsal purchasePrice oproti DB hodnotě?
      // (0.01 tolerance proti decimal float wobble.) Pokud ano → respektovat,
      // auto-update neaplikovat. Když pole nebylo posláno (undefined) → UI ho
      // neposílá v tomto requestu (jiný caller) → auto-update OK.
      const dbPurchase = ctx.purchasePrice ? Number(ctx.purchasePrice) : 0;
      const sentPurchase = data.purchasePrice !== undefined ? Number(data.purchasePrice) : null;
      const userChangedPurchase = sentPurchase !== null && Math.abs(sentPurchase - dbPurchase) >= 0.01;

      if (!userChangedPurchase) {
        // Merge nové hodnoty (data.*) s aktuálním DB stavem (ctx.*) — co user
        // poslal v PATCH ještě není uloženo, ale chceme s tím spočítat hned.
        const nextWeight = data.weight !== undefined ? Number(data.weight) : (ctx.weight ? Number(ctx.weight) : null);
        const nextItemPpg = data.purchasePricePerGramCzk !== undefined
          ? (data.purchasePricePerGramCzk === null ? null : Number(data.purchasePricePerGramCzk))
          : (ctx.purchasePricePerGramCzk ? Number(ctx.purchasePricePerGramCzk) : null);

        const ppg = resolvePpg(
          {
            id: itemId,
            weightGrams: nextWeight !== null ? String(nextWeight) : null,
            purchasePricePerGramCzk: nextItemPpg !== null ? String(nextItemPpg) : null,
            manualPriceInclVatCzk: null,
            attrs: { pasShape: null, location: null, attrDamage: null, attrColor: [], attrCollectible: false },
            box: {
              purchasePricePerGramCzk: ctx.box?.purchasePricePerGramCzk?.toString() ?? null,
              purchaseAmountCzk: ctx.box?.purchaseAmountCzk?.toString() ?? null,
              declaredWeight: ctx.box?.declaredWeight?.toString() ?? null,
            },
          },
          {
            id: ctx.orderId ?? 0,
            defaultPurchasePricePerGramCzk: ctx.order?.defaultPurchasePricePerGramCzk?.toString() ?? null,
            allocationMethod: 'BY_WEIGHT',
            vatRatePct: '21',
            roundingStep: 10,
          },
        );

        if (nextWeight !== null && nextWeight > 0 && ppg !== null && ppg.gt(0)) {
          data.purchasePrice = ppg.times(nextWeight).toFixed(2);
        }
      }

      // Status downgrade — vždy když se mění weight/PPG, items mimo NEEDS_INPUT
      // jdou do STALE (plné recalc potřeba pro správné recommended ceny).
      // NEEDS_INPUT necháme — chybí základní data, STALE by zakrylo důležitější
      // signál. Stejně tak nepřevádět z NEEDS_INPUT nahoru.
      if (ctx.pricingStatus !== 'NEEDS_INPUT' && ctx.pricingStatus !== 'STALE') {
        data.pricingStatus = 'STALE';
      }
    }
  }

  // Auto re-evaluate pricingStatus po update povinnych evidencnich poli
  // (pasShape / attrDamage / attrColor / location). Bez nej by status zustal
  // NEEDS_REVIEW dokud user nespusti „Prepocitat zakazku" — i kdyz uz neni proc.
  // Toto je „light" re-evaluation per kamen — bez alokace nakladů a marže
  // (ty potrebuji vsechny items zakazky). Tj. recommendedPrice se zde neprepocita,
  // jen overime ze povinna pole jsou kompletni + manualPrice neni pod recommended.
  const affectsRequiredField =
    data.pasShape !== undefined ||
    data.attrDamage !== undefined ||
    data.attrColor !== undefined ||
    data.location !== undefined;

  if (affectsRequiredField && data.pricingStatus === undefined && !affectsPurchase) {
    const ctx2 = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        pasShape: true, attrDamage: true, attrColor: true, location: true,
        weight: true, recommendedPriceInclVatCzk: true, manualPriceInclVatCzk: true,
        pricingStatus: true,
      },
    });
    if (ctx2) {
      // Merge nove (data.*) s aktualnimi DB (ctx2.*) hodnotami
      const nextPas = (data.pasShape !== undefined ? data.pasShape : ctx2.pasShape) as string | null;
      const nextDmg = (data.attrDamage !== undefined ? data.attrDamage : ctx2.attrDamage) as string | null;
      const nextColor = (data.attrColor !== undefined ? data.attrColor : ctx2.attrColor) as string[] | null;
      const nextLoc = (data.location !== undefined ? data.location : ctx2.location) as string | null;

      const stillMissing = !nextPas || !nextDmg || !nextColor || !Array.isArray(nextColor) || nextColor.length === 0 || !nextLoc;
      const weight = ctx2.weight ? Number(ctx2.weight) : 0;
      const recommended = ctx2.recommendedPriceInclVatCzk ? Number(ctx2.recommendedPriceInclVatCzk) : 0;
      const manual = ctx2.manualPriceInclVatCzk ? Number(ctx2.manualPriceInclVatCzk) : null;

      // Pravidla pro update:
      // - STALE necháme (signál „spusť Přepočítat" pro alokace/marže)
      // - NEEDS_INPUT necháme (chybí váha/PPG → priorita nad NEEDS_REVIEW)
      // - Pokud weight nebo recommended = 0, status flow nezasahujeme (nemáme bezpečně co spočítat)
      if (
        ctx2.pricingStatus !== 'STALE' &&
        ctx2.pricingStatus !== 'NEEDS_INPUT' &&
        weight > 0 &&
        recommended > 0
      ) {
        if (stillMissing) {
          data.pricingStatus = 'NEEDS_REVIEW';
        } else if (manual !== null && manual < recommended) {
          data.pricingStatus = 'NEEDS_REVIEW';
        } else {
          data.pricingStatus = 'OK';
        }
      }
    }
  }

  // Sold transition detection: pokud teď přechází z false na true, po update
  // zafixujeme `priceCalcSnapshot` pro audit. Snapshot reflektuje hodnoty
  // PO aplikaci tohoto PATCHe (ne před) — kdyby user současně změnil weight
  // a označil sold=true, snapshot drží nové weight + ceny z nové konfigurace.
  let isBecomingSold = false;
  if (data.sold === true) {
    const prev = await prisma.item.findUnique({
      where: { id: itemId },
      select: { sold: true, soldAt: true },
    });
    if (prev && !prev.sold) {
      isBecomingSold = true;
      if (!prev.soldAt) data.soldAt = new Date();
    }
  }

  if (isBecomingSold) {
    await prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: itemId }, data });
      const capturedAt = new Date();
      const snap = await captureItemSaleSnapshot(tx, itemId, capturedAt);
      if (snap) {
        await tx.item.update({
          where: { id: itemId },
          data: {
            priceCalcSnapshot: snap as never,
            priceCalcSnapshotAt: capturedAt,
          },
        });
      }
    });
  } else {
    await prisma.item.update({ where: { id: itemId }, data });
  }

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
  const itemId = parseItemId(id);
  if (itemId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  await prisma.item.delete({ where: { id: itemId } });
  await logActivity(session.id, 'item.delete', id);
  return NextResponse.json({ success: true });
}
