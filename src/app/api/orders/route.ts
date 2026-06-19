import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { generateOrderCode, isUniqueViolation } from '@/lib/orders/codes';
import { serializeOrder } from '@/lib/orders/serialize';

const ALLOCATION_METHODS = ['BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE'] as const;
type AllocationMethod = (typeof ALLOCATION_METHODS)[number];
const VALID_STATUSES = ['DRAFT', 'PRICED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'] as const;

/** Akceptuj number nebo "number" string, vrátí finite číslo nebo null. */
function asFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const seller = searchParams.get('seller');
  const search = searchParams.get('q');

  const where: Record<string, unknown> = {};
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (seller) where.sellerName = { contains: seller, mode: 'insensitive' };
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { sellerName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: { _count: { select: { items: true, costs: true } } },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(orders.map(serializeOrder));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Enum validace
  const allocationMethod = (body.allocationMethod as AllocationMethod) ?? 'BY_WEIGHT';
  if (!(ALLOCATION_METHODS as readonly string[]).includes(allocationMethod)) {
    return NextResponse.json({ error: `allocationMethod musí být ${ALLOCATION_METHODS.join('/')}` }, { status: 422 });
  }

  // Numeric guards — žádné negativní/NaN hodnoty
  const declaredPieces = asFiniteNumber(body.declaredPieces ?? 0);
  if (declaredPieces === null || declaredPieces < 0 || !Number.isInteger(declaredPieces)) {
    return NextResponse.json({ error: 'declaredPieces musí být nezáporné celé číslo' }, { status: 422 });
  }
  const vatRatePct = asFiniteNumber(body.vatRatePct ?? 21);
  if (vatRatePct === null || vatRatePct < 0 || vatRatePct > 100) {
    return NextResponse.json({ error: 'vatRatePct musí být v rozsahu 0–100' }, { status: 422 });
  }
  const roundingStep = asFiniteNumber(body.roundingStep ?? 10);
  if (roundingStep === null || roundingStep <= 0 || !Number.isInteger(roundingStep)) {
    return NextResponse.json({ error: 'roundingStep musí být kladné celé číslo' }, { status: 422 });
  }
  const totalPurchase = asFiniteNumber(body.totalPurchaseAmountCzk ?? body.totalPurchaseAmountSource ?? 0);
  if (totalPurchase === null || totalPurchase < 0) {
    return NextResponse.json({ error: 'totalPurchaseAmountCzk musí být ≥ 0' }, { status: 422 });
  }
  const defaultPpgSource = body.defaultPurchasePricePerGramSource === undefined || body.defaultPurchasePricePerGramSource === null
    ? null
    : asFiniteNumber(body.defaultPurchasePricePerGramSource);
  if (defaultPpgSource !== null && defaultPpgSource < 0) {
    return NextResponse.json({ error: 'defaultPurchasePricePerGramSource musí být ≥ 0' }, { status: 422 });
  }
  const defaultPpgCzk = body.defaultPurchasePricePerGramCzk === undefined || body.defaultPurchasePricePerGramCzk === null
    ? defaultPpgSource
    : asFiniteNumber(body.defaultPurchasePricePerGramCzk);
  if (defaultPpgCzk !== null && defaultPpgCzk < 0) {
    return NextResponse.json({ error: 'defaultPurchasePricePerGramCzk musí být ≥ 0' }, { status: 422 });
  }

  const customCode = typeof body.code === 'string' && body.code.length > 0 ? body.code : null;

  // Auto-default: pokud body neuvedlo pricingConfigId, použít aktuálně aktivní
  // konfiguraci z admin/pricing-config (jedna z všech může mít active=true).
  // User to vždy může přepsat v Order detail → tab Cenotvorba.
  let resolvedPricingConfigId: number | null = null;
  if (body.pricingConfigId !== undefined && body.pricingConfigId !== null) {
    const n = Number(body.pricingConfigId);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'pricingConfigId musí být kladné celé číslo nebo null' }, { status: 422 });
    }
    resolvedPricingConfigId = n;
  } else {
    const activeCfg = await prisma.pricingConfig.findFirst({ where: { active: true }, select: { id: true } });
    if (activeCfg) resolvedPricingConfigId = activeCfg.id;
  }

  // Race-safe create: pokud generateOrderCode + create dostane unique violation
  // (souběžné požadavky), zkus znova s vyšším číslem. Limit 5 pokusů.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = customCode ?? (await generateOrderCode());
    try {
      const order = await prisma.order.create({
        data: {
          code,
          title: typeof body.title === 'string' ? body.title : '',
          sellerName: typeof body.sellerName === 'string' ? body.sellerName : '',
          sellerContact: typeof body.sellerContact === 'string' ? body.sellerContact : '',
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate as string) : null,
          declaredPieces,
          declaredWeight: body.declaredWeight === undefined || body.declaredWeight === null ? null : asFiniteNumber(body.declaredWeight),
          originLocality: typeof body.originLocality === 'string' ? body.originLocality : '',
          notes: typeof body.notes === 'string' ? body.notes : '',
          sourceCurrency: typeof body.sourceCurrency === 'string' ? body.sourceCurrency : 'CZK',
          totalPurchaseAmountSource: totalPurchase,
          totalPurchaseAmountCzk: totalPurchase,
          defaultPurchasePricePerGramSource: defaultPpgSource,
          defaultPurchasePricePerGramCzk: defaultPpgCzk,
          allocationMethod,
          vatRatePct,
          roundingStep,
          pricingConfigId: resolvedPricingConfigId,
        },
      });
      await logActivity(session.id, 'order.create', order.code, JSON.stringify({ title: order.title, sellerName: order.sellerName }));
      return NextResponse.json(serializeOrder(order), { status: 201 });
    } catch (err) {
      if (customCode && isUniqueViolation(err)) {
        return NextResponse.json({ error: `Order s code='${customCode}' už existuje` }, { status: 409 });
      }
      if (!isUniqueViolation(err)) {
        lastError = err;
        break;
      }
      // Pokud auto-generated code → loop znovu
      lastError = err;
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  return NextResponse.json({ error: `Vytvoření selhalo: ${msg}` }, { status: 500 });
}
