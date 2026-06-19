import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { validatePricingRulesJson } from '@/lib/orders/validateRules';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cfg = await prisma.pricingConfig.findUnique({
    where: { id: parseInt(id, 10) },
    include: { _count: { select: { orders: true } } },
  });
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(cfg);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cfgId = parseInt(id, 10);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.validFrom !== undefined) data.validFrom = body.validFrom ? new Date(body.validFrom as string) : null;
  if (body.validTo !== undefined) data.validTo = body.validTo ? new Date(body.validTo as string) : null;
  const rulesChanged = body.rules !== undefined;
  if (rulesChanged) {
    const issues = validatePricingRulesJson(body.rules);
    if (issues.length > 0) {
      return NextResponse.json({ error: 'Neplatná struktura rules', issues }, { status: 422 });
    }
    data.rules = body.rules;
  }

  // Když se mění pravidla, označ items aktivních zakázek STALE — signál pro
  // user „zakázka má neaktuální ceny, klikni Přepočítat". Snapshoty se už
  // neinvalidují — aktivní zakázky snapshot vůbec nepoužívají (cesta A,
  // 19. 6. 2026), recalc čte vždy current rules. CANCELLED/ARCHIVED items
  // STALE nedáváme — jejich ceny jsou historické a recalc by je rozhodil.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.pricingConfig.update({ where: { id: cfgId }, data });
    let stalledItems = 0;
    if (rulesChanged) {
      const stale = await tx.item.updateMany({
        where: {
          order: {
            pricingConfigId: cfgId,
            status: { in: ['DRAFT', 'PRICED', 'PUBLISHED'] },
          },
          pricingStatus: 'OK',
        },
        data: { pricingStatus: 'STALE' },
      });
      stalledItems = stale.count;
    }
    return { updated, stalledItems };
  });

  await logActivity(
    session.id,
    'pricing_config.update',
    String(cfgId),
    JSON.stringify({
      keys: Object.keys(data),
      stalledItems: result.stalledItems,
    })
  );
  return NextResponse.json({
    ...result.updated,
    _meta: { stalledItems: result.stalledItems },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cfgId = parseInt(id, 10);
  const cfg = await prisma.pricingConfig.findUnique({
    where: { id: cfgId },
    include: { _count: { select: { orders: true } } },
  });
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (cfg._count.orders > 0) {
    return NextResponse.json(
      {
        error: 'PricingConfig používá alespoň jedna Order — nelze smazat. Nejprve změň konfiguraci u dotčených zakázek nebo je archivuj (archivované drží vlastní snapshot pravidel).',
        orderCount: cfg._count.orders,
      },
      { status: 409 }
    );
  }

  await prisma.pricingConfig.delete({ where: { id: cfgId } });
  await logActivity(session.id, 'pricing_config.delete', String(cfgId), JSON.stringify({ name: cfg.name }));
  return NextResponse.json({ success: true });
}
