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
  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.validFrom !== undefined) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  if (body.validTo !== undefined) data.validTo = body.validTo ? new Date(body.validTo) : null;
  if (body.rules !== undefined) {
    const issues = validatePricingRulesJson(body.rules);
    if (issues.length > 0) {
      return NextResponse.json({ error: 'Neplatná struktura rules', issues }, { status: 422 });
    }
    data.rules = body.rules;
  }

  const updated = await prisma.pricingConfig.update({ where: { id: cfgId }, data });
  await logActivity(session.id, 'pricing_config.update', String(cfgId), JSON.stringify(Object.keys(data)));
  return NextResponse.json(updated);
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
