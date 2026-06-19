import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

  // Když se mění pravidla, invaliduj snapshoty v aktivních zakázkách které
  // tento config používají. Jinak by si zakázky držely starý snapshot a další
  // Přepočítat by ignorovalo úpravy v cenotvorbě (typický bug: user přidá
  // attrDamage rule, klikne Přepočítat, bonus se nepřičte). CANCELLED a
  // ARCHIVED zakázky nechat — jejich snapshot je historický záznam.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.pricingConfig.update({ where: { id: cfgId }, data });
    let invalidatedOrders = 0;
    let stalledItems = 0;
    if (rulesChanged) {
      const affected = await tx.order.updateMany({
        where: {
          pricingConfigId: cfgId,
          status: { in: ['DRAFT', 'PRICED', 'PUBLISHED'] },
        },
        data: {
          pricingConfigSnapshot: Prisma.DbNull,
          pricingConfigVersion: null,
        },
      });
      invalidatedOrders = affected.count;
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
    return { updated, invalidatedOrders, stalledItems };
  });

  await logActivity(
    session.id,
    'pricing_config.update',
    String(cfgId),
    JSON.stringify({
      keys: Object.keys(data),
      invalidatedOrders: result.invalidatedOrders,
      stalledItems: result.stalledItems,
    })
  );
  return NextResponse.json({
    ...result.updated,
    _meta: {
      invalidatedOrders: result.invalidatedOrders,
      stalledItems: result.stalledItems,
    },
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
        error: 'PricingConfig používá alespoň jedna Order — nelze smazat. Zakázky mají vlastní snapshot, takže smazání ovlivní jen UI dropdown.',
        orderCount: cfg._count.orders,
      },
      { status: 409 }
    );
  }

  await prisma.pricingConfig.delete({ where: { id: cfgId } });
  await logActivity(session.id, 'pricing_config.delete', String(cfgId), JSON.stringify({ name: cfg.name }));
  return NextResponse.json({ success: true });
}
