import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { serializeOrder, serializeCost, serializeItemForPricing } from '@/lib/orders/serialize';

// Whitelist polí povolených pro PATCH (uživatelské metadata + cenotvorba).
const ALLOWED_PATCH_FIELDS = [
  'title', 'sellerName', 'sellerContact', 'sellerId', 'purchaseDate',
  'declaredPieces', 'declaredWeight', 'originLocality', 'notes',
  'sourceCurrency', 'totalPurchaseAmountSource', 'totalPurchaseAmountCzk',
  'exchangeRate', 'exchangeRateDate',
  'defaultPurchasePricePerGramSource', 'defaultPurchasePricePerGramCzk',
  'allocationMethod', 'vatRatePct', 'roundingStep',
  'pricingConfigId',
  'status',
];

const ALLOCATION_METHODS = ['BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE'];
const VALID_STATUSES = ['DRAFT', 'PRICED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];

/** Validuje že hodnota je finite number a v rozsahu. NaN/Infinity = false. */
function isFiniteInRange(v: unknown, min: number, max: number): boolean {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) && n >= min && n <= max;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      costs: { orderBy: { createdAt: 'asc' } },
      items: { include: { box: { select: { id: true, code: true } } }, orderBy: { evidNumber: 'asc' } },
      boxes: { select: { id: true, code: true, name: true, sellerId: true }, orderBy: { code: 'asc' } },
      pricingConfig: true,
      seller: { select: { id: true, firstName: true, lastName: true, alias: true } },
      _count: { select: { items: true, costs: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sellerDisplay = order.seller
    ? `${order.seller.firstName} ${order.seller.lastName}`.trim() + (order.seller.alias ? ` (${order.seller.alias})` : '')
    : null;

  return NextResponse.json({
    ...serializeOrder(order),
    sellerDisplay: sellerDisplay || null,
    costs: order.costs.map(serializeCost),
    items: order.items.map(serializeItemForPricing),
    boxes: order.boxes,
    pricingConfig: order.pricingConfig,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH_FIELDS) {
    if (body[k] !== undefined) data[k] = body[k];
  }

  // ── Enum validace
  if (data.allocationMethod !== undefined && !ALLOCATION_METHODS.includes(data.allocationMethod as string)) {
    return NextResponse.json({ error: `allocationMethod musí být ${ALLOCATION_METHODS.join('/')}` }, { status: 422 });
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status as string)) {
    return NextResponse.json({ error: `status musí být ${VALID_STATUSES.join('/')}` }, { status: 422 });
  }
  // Destruktivní status změny (CANCELLED, ARCHIVED) jen pro ADMIN
  if ((data.status === 'CANCELLED' || data.status === 'ARCHIVED') && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Storno a archivace jsou jen pro administrátora' }, { status: 403 });
  }

  // ── Numeric guards
  if (data.vatRatePct !== undefined && !isFiniteInRange(data.vatRatePct, 0, 100)) {
    return NextResponse.json({ error: 'vatRatePct musí být 0–100' }, { status: 422 });
  }
  if (data.roundingStep !== undefined) {
    const n = typeof data.roundingStep === 'string' ? Number(data.roundingStep) : (data.roundingStep as number);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      return NextResponse.json({ error: 'roundingStep musí být kladné celé číslo' }, { status: 422 });
    }
    data.roundingStep = n;
  }
  if (data.declaredPieces !== undefined) {
    const n = typeof data.declaredPieces === 'string' ? Number(data.declaredPieces) : (data.declaredPieces as number);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json({ error: 'declaredPieces musí být nezáporné celé číslo' }, { status: 422 });
    }
    data.declaredPieces = n;
  }
  for (const f of ['totalPurchaseAmountSource', 'totalPurchaseAmountCzk', 'declaredWeight', 'defaultPurchasePricePerGramSource', 'defaultPurchasePricePerGramCzk'] as const) {
    if (data[f] === undefined || data[f] === null) continue;
    const n = typeof data[f] === 'string' ? Number(data[f]) : (data[f] as number);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `${f} musí být ≥ 0 a finite` }, { status: 422 });
    }
    data[f] = n;
  }

  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate as string);
  if (data.exchangeRateDate) data.exchangeRateDate = new Date(data.exchangeRateDate as string);

  // Změna pricingConfigId / cenotvorby = stones jdou do STALE (přepočet potřeba)
  const triggersStale =
    data.allocationMethod !== undefined ||
    data.vatRatePct !== undefined ||
    data.roundingStep !== undefined ||
    data.defaultPurchasePricePerGramCzk !== undefined ||
    data.defaultPurchasePricePerGramSource !== undefined ||
    data.pricingConfigId !== undefined;

  // Lifecycle snapshot: přechod do CANCELLED/ARCHIVED zafixuje aktuální
  // PricingConfig.rules do Order.pricingConfigSnapshot. Recalc na historické
  // zakázce pak používá tento snapshot (reprodukovatelnost ceny v okamžiku
  // uzavření). Aktivní zakázky snapshot nepoužívají vůbec.
  const archivingTransition =
    data.status === 'CANCELLED' || data.status === 'ARCHIVED';

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Pokud archivujeme a snapshot ještě není uložený, načti aktuální config
      // a zafixuj ho. Pokud zakázka nemá pricingConfigId, snapshot zůstane NULL
      // (znamená že recalc použije prázdný config = žádné marže).
      if (archivingTransition) {
        const existing = await tx.order.findUnique({
          where: { id: orderId },
          select: { pricingConfigSnapshot: true, pricingConfigId: true },
        });
        if (existing && !existing.pricingConfigSnapshot && existing.pricingConfigId) {
          const cfg = await tx.pricingConfig.findUnique({
            where: { id: existing.pricingConfigId },
            select: { rules: true },
          });
          if (cfg) {
            const rulesJson = cfg.rules as { version?: number } | null;
            const version = typeof rulesJson?.version === 'number' ? rulesJson.version : 1;
            data.pricingConfigSnapshot = cfg.rules as never;
            data.pricingConfigVersion = version;
          }
        }
      }
      const order = await tx.order.update({ where: { id: orderId }, data: data as never });
      if (triggersStale) {
        await tx.item.updateMany({
          where: { orderId, pricingStatus: 'OK' },
          data: { pricingStatus: 'STALE' },
        });
      }
      return order;
    });
    await logActivity(session.id, 'order.update', updated.code, JSON.stringify(Object.keys(data)));
    return NextResponse.json(serializeOrder(updated));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * DELETE Order. ADMIN-only, vyžaduje ?confirm=DOUBLE_CHECK (frontend dělá
 * 2× confirm() dialog před tímhle requestem). 409 pokud má items.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('confirm') !== 'DOUBLE_CHECK') {
    return NextResponse.json({ error: 'Smazání vyžaduje ?confirm=DOUBLE_CHECK' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { _count: { select: { items: true } } },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (order._count.items > 0) {
    return NextResponse.json(
      {
        error: 'Zakázka má přiřazené kameny — nejdřív je přesuň nebo smaž, nebo použij Storno (status=CANCELLED).',
        itemCount: order._count.items,
      },
      { status: 409 }
    );
  }

  await prisma.order.delete({ where: { id: orderId } });
  await logActivity(session.id, 'order.delete', order.code);
  return NextResponse.json({ success: true });
}
