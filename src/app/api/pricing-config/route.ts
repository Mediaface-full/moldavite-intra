import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { validatePricingRulesJson } from '@/lib/orders/validateRules';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configs = await prisma.pricingConfig.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(configs);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.name !== 'string' || body.name.length === 0) {
    return NextResponse.json({ error: 'name je povinný' }, { status: 422 });
  }
  if (body.rules === undefined) {
    return NextResponse.json({ error: 'rules je povinný' }, { status: 422 });
  }
  const issues = validatePricingRulesJson(body.rules);
  if (issues.length > 0) {
    return NextResponse.json({ error: 'Neplatná struktura rules', issues }, { status: 422 });
  }

  const cfg = await prisma.pricingConfig.create({
    data: {
      name: body.name as string,
      active: false,
      validFrom: body.validFrom ? new Date(body.validFrom as string) : null,
      validTo: body.validTo ? new Date(body.validTo as string) : null,
      rules: body.rules as never,
    },
  });
  await logActivity(session.id, 'pricing_config.create', String(cfg.id), JSON.stringify({ name: cfg.name }));
  return NextResponse.json(cfg, { status: 201 });
}
