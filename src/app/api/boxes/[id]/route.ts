import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { recalcOrder } from '@/lib/orders/recalcOrder';
import { decideBoxDelete } from '@/lib/boxDelete';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const boxId = parseInt(id, 10);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return NextResponse.json({ error: 'Invalid box id' }, { status: 400 });
  }
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.placement !== undefined) data.placement = body.placement;

  // cassetteType je teď String (řízeno přes AttrOption). Validace probíhá
  // softly — uložíme co přijde; admin si může v /admin/attributes aktivovat
  // nové hodnoty bez deploye.
  if (body.cassetteType !== undefined && typeof body.cassetteType === 'string') {
    data.cassetteType = body.cassetteType;
  }

  // Per-kazeta dodavatel a cenotvorba (vše nullable — null = dědí z Order)
  if (body.sellerId !== undefined) {
    data.sellerId = body.sellerId === null ? null : Number(body.sellerId);
  }

  // Přesun kazety mezi zakázkami (orderId). null = oddělit od zakázky (skladová).
  // Pri zmene musi:
  //  1) Item.orderId vsech kamenu v box → sync s novym Box.orderId
  //  2) Recalc OBOU zakazek (zdrojova ztratila alokaci, cilova ziskala)
  let orderTransition: { from: number | null; to: number | null } | null = null;
  if (body.orderId !== undefined) {
    const newOrderId = body.orderId === null ? null : Number(body.orderId);
    if (newOrderId !== null && (!Number.isInteger(newOrderId) || newOrderId <= 0)) {
      return NextResponse.json({ error: 'orderId musí být pozitivní integer nebo null' }, { status: 422 });
    }
    if (newOrderId !== null) {
      // Verifikuj že target zakazka existuje
      const targetOrder = await prisma.order.findUnique({ where: { id: newOrderId }, select: { id: true } });
      if (!targetOrder) {
        return NextResponse.json({ error: `Zakázka id=${newOrderId} neexistuje` }, { status: 404 });
      }
    }
    const currentBox = await prisma.box.findUnique({ where: { id: boxId }, select: { orderId: true } });
    if (currentBox && currentBox.orderId !== newOrderId) {
      data.orderId = newOrderId;
      orderTransition = { from: currentBox.orderId, to: newOrderId };
    }
  }
  if (body.declaredPieces !== undefined) {
    const n = body.declaredPieces === null ? null : Number(body.declaredPieces);
    if (n !== null && (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
      return NextResponse.json({ error: 'declaredPieces musí být nezáporné celé číslo nebo null' }, { status: 422 });
    }
    data.declaredPieces = n;
  }
  for (const f of ['declaredWeight', 'purchaseAmountCzk', 'purchasePricePerGramCzk'] as const) {
    if (body[f] === undefined) continue;
    if (body[f] === null) { data[f] = null; continue; }
    const n = Number(body[f]);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `${f} musí být ≥ 0 nebo null` }, { status: 422 });
    }
    data[f] = n;
  }

  const box = await prisma.box.update({
    where: { id: boxId },
    data,
  });

  // If placement changed, propagate to all items in this box that still have default (empty) storage
  if (body.placement !== undefined && body.propagatePlacement) {
    await prisma.item.updateMany({
      where: { boxId, storage: '' },
      data: { storage: body.placement },
    });
    await logActivity(session.id, 'box.placement', box.code, `Umístění: ${body.placement} (propsáno ke kamenům)`);
  } else if (body.placement !== undefined) {
    await logActivity(session.id, 'box.placement', box.code, `Umístění: ${body.placement}`);
  }

  // Pri presunu mezi zakazkami: sync Item.orderId + recalc obou Orderu.
  if (orderTransition) {
    // Sync items.orderId (musi byt = box.orderId aby calculate.ts aplikoval spravnou cenotvorbu)
    await prisma.item.updateMany({
      where: { boxId },
      data: { orderId: orderTransition.to },
    });
    await logActivity(
      session.id,
      'box.update',
      box.code,
      JSON.stringify({ orderId: { from: orderTransition.from, to: orderTransition.to } }),
    );
    // Auto-recalc obou Orderu (zdrojova ztratila kazetu, cilova ziskala → alokace + ceny se meni)
    try {
      if (orderTransition.from) await recalcOrder(orderTransition.from);
      if (orderTransition.to) await recalcOrder(orderTransition.to);
    } catch (err) {
      console.error('Auto-recalc after box order transition failed:', err);
    }
  }

  return NextResponse.json(box);
}

/**
 * DELETE kazetu (ADMIN, ?confirm=DOUBLE_CHECK).
 *
 * 15. 9. 2026 (Gideon: „nemohu odstranit kazetu, což je divné"): dřív šla
 * smazat jen prázdná kazeta → kameny po jednom. Teď:
 *  - prázdná → smazat
 *  - s kameny + `?withItems=1` → smaže kameny i kazetu v jedné transakci a
 *    přepočítá zakázku (kameny byly v její alokaci)
 *  - s PRODANÝM kamenem → 409 vždy (audit prodeje `priceCalcSnapshot` se
 *    nemaže; kámen se má přesunout jinam)
 * Pravidla sdílí s UI přes lib/boxDelete.ts. Box.orderId FK je SET NULL,
 * smazání kazety Order nepoškodí.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — jen administrátor' }, { status: 403 });
  }

  const { id } = await params;
  const boxId = parseInt(id, 10);
  if (!Number.isInteger(boxId) || boxId <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('confirm') !== 'DOUBLE_CHECK') {
    return NextResponse.json({ error: 'Smazání vyžaduje ?confirm=DOUBLE_CHECK' }, { status: 400 });
  }
  const withItems = searchParams.get('withItems') === '1';

  const box = await prisma.box.findUnique({
    where: { id: boxId },
    include: { items: { select: { id: true, sold: true } } },
  });
  if (!box) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const itemCount = box.items.length;
  const soldCount = box.items.filter((i) => i.sold).length;
  const decision = decideBoxDelete({ itemCount, soldCount, withItems });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, itemCount, soldCount }, { status: decision.status });
  }

  await prisma.$transaction(async (tx) => {
    if (itemCount > 0) await tx.item.deleteMany({ where: { boxId } });
    await tx.box.delete({ where: { id: boxId } });
  });

  // Kameny byly součástí zakázky → přepočítat její součty. Mimo transakci:
  // selhání přepočtu nesmí vrátit už provedené smazání.
  if (itemCount > 0 && box.orderId) {
    try {
      await recalcOrder(box.orderId);
    } catch (err) {
      console.error(`[boxes DELETE] recalcOrder(${box.orderId}) po smazání kazety selhal:`, err);
    }
  }

  await logActivity(session.id, 'box.delete', box.code, JSON.stringify({ name: box.name, itemsDeleted: itemCount }));
  return NextResponse.json({ success: true, itemsDeleted: itemCount });
}
