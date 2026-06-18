import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { isSafePathSegment } from '@/lib/fileValidation';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const boxes = await prisma.box.findMany({
    include: {
      _count: { select: { items: true } },
      items: {
        take: 4,
        select: { photoPath: true, evidNumber: true },
        orderBy: { evidNumber: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });
  return NextResponse.json(boxes);
}

/**
 * POST /api/boxes — vytvořit kazetu.
 * Body: {
 *   code?: string       // pokud chybí, auto-generuje K####
 *   name?: string
 *   cassetteType?: string  // String z AttrOption (default "Kameny")
 *   placement?: string
 *   orderId?: number    // přiřazení k zakázce (null = volná skladová)
 *   sellerId?: number   // dodavatel této konkrétní kazety
 *   declaredPieces?: number
 *   declaredWeight?: number
 *   purchaseAmountCzk?: number
 *   purchasePricePerGramCzk?: number
 * }
 *
 * Auto-generace code:
 * - Najde max numeric suffix u existujících "K####" kódů, +1, padded 4-digit
 * - Retry loop pro race-condition (unique violation → retry s vyšším číslem)
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';
}

async function nextBoxCode(): Promise<string> {
  const existing = await prisma.box.findMany({
    where: { code: { startsWith: 'K' } },
    select: { code: true },
  });
  let maxN = 0;
  for (const { code } of existing) {
    const m = code.match(/^K(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `K${String(maxN + 1).padStart(4, '0')}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Validate / normalize fields
  const explicitCode = typeof body.code === 'string' ? body.code.trim() : '';
  if (explicitCode && !isSafePathSegment(explicitCode)) {
    return NextResponse.json({ error: 'code musí být [A-Za-z0-9_-]{1,64}' }, { status: 422 });
  }

  const data: Record<string, unknown> = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    cassetteType: typeof body.cassetteType === 'string' && body.cassetteType.trim() !== '' ? body.cassetteType.trim() : 'Kameny',
    placement: typeof body.placement === 'string' ? body.placement.trim() : '',
  };

  if (body.orderId !== undefined && body.orderId !== null) {
    const n = Number(body.orderId);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'orderId musí být kladné celé číslo nebo null' }, { status: 422 });
    }
    const order = await prisma.order.findUnique({ where: { id: n }, select: { id: true } });
    if (!order) return NextResponse.json({ error: 'Zakázka neexistuje' }, { status: 404 });
    data.orderId = n;
  }
  if (body.sellerId !== undefined && body.sellerId !== null) {
    const n = Number(body.sellerId);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'sellerId musí být kladné celé číslo nebo null' }, { status: 422 });
    }
    const seller = await prisma.seller.findUnique({ where: { id: n }, select: { id: true } });
    if (!seller) return NextResponse.json({ error: 'Dodavatel neexistuje' }, { status: 404 });
    data.sellerId = n;
  }
  for (const f of ['declaredWeight', 'purchaseAmountCzk', 'purchasePricePerGramCzk'] as const) {
    if (body[f] === undefined || body[f] === null) continue;
    const n = Number(body[f]);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `${f} musí být ≥ 0 nebo null` }, { status: 422 });
    }
    data[f] = n;
  }
  if (body.declaredPieces !== undefined && body.declaredPieces !== null) {
    const n = Number(body.declaredPieces);
    if (!Number.isInteger(n) || n < 0 || n > 9999) {
      return NextResponse.json({ error: 'declaredPieces musí být celé číslo 0–9999' }, { status: 422 });
    }
    data.declaredPieces = n;
  }

  // Create with retry pro race-condition na auto-generovaném code
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = explicitCode || await nextBoxCode();
    try {
      const box = await prisma.box.create({ data: { ...data, code } });
      await logActivity(session.id, 'box.create', code, JSON.stringify({ orderId: data.orderId ?? null, sellerId: data.sellerId ?? null, cassetteType: data.cassetteType }));
      return NextResponse.json(box, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        if (explicitCode) {
          return NextResponse.json({ error: `Kazeta s kódem "${code}" už existuje` }, { status: 409 });
        }
        // Auto-gen kolize → další pokus
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }
  return NextResponse.json({ error: 'Nepodařilo se vygenerovat unikátní kód kazety po 5 pokusech — zkus to znovu' }, { status: 503 });
}
