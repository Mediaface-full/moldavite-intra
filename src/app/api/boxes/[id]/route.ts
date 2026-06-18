import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const boxId = parseInt(id);
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

  return NextResponse.json(box);
}

/**
 * DELETE kazetu. Smazání povoleno jen pokud:
 *  - uživatel je ADMIN
 *  - kazety nemá žádné kameny (jinak 409)
 *  - kazety není navázaná na Order který má ještě jiné kameny (Box.orderId FK
 *    je SET NULL, takže smazání Box samo o sobě Order nepoškodí)
 *
 * UI volá s ?confirm=DOUBLE_CHECK aby šlo o vědomou akci (frontend dělá
 * 2× confirm() dialog před tímhle requestem).
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
  if (Number.isNaN(boxId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('confirm') !== 'DOUBLE_CHECK') {
    return NextResponse.json({ error: 'Smazání vyžaduje ?confirm=DOUBLE_CHECK' }, { status: 400 });
  }

  const box = await prisma.box.findUnique({
    where: { id: boxId },
    include: { _count: { select: { items: true } } },
  });
  if (!box) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (box._count.items > 0) {
    return NextResponse.json(
      { error: `Kazeta obsahuje ${box._count.items} kamenů — nejdřív je přesuň nebo smaž.`, itemCount: box._count.items },
      { status: 409 }
    );
  }

  await prisma.box.delete({ where: { id: boxId } });
  await logActivity(session.id, 'box.delete', box.code, JSON.stringify({ name: box.name }));
  return NextResponse.json({ success: true });
}
