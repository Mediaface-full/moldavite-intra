import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

const ALLOWED_KEYS = ['pasShape', 'attrDamage', 'attrColor', 'location'] as const;

/**
 * GET /api/attr-options?key=pasShape  → seznam aktivních hodnot pro daný atribut
 * GET /api/attr-options                → všechny atributy (admin)
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const includeInactive = searchParams.get('includeInactive') === '1';

  const where: Record<string, unknown> = {};
  if (key) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      return NextResponse.json({ error: `key musí být ${ALLOWED_KEYS.join('/')}` }, { status: 422 });
    }
    where.attrKey = key;
  }
  if (!includeInactive) where.active = true;

  const options = await prisma.attrOption.findMany({
    where,
    orderBy: [{ attrKey: 'asc' }, { sortOrder: 'asc' }, { value: 'asc' }],
  });

  return NextResponse.json(options);
}

/**
 * POST /api/attr-options  (jen ADMIN)
 * Body: { attrKey, value, label?, sortOrder?, active? }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.attrKey !== 'string' || !(ALLOWED_KEYS as readonly string[]).includes(body.attrKey)) {
    return NextResponse.json({ error: `attrKey musí být ${ALLOWED_KEYS.join('/')}` }, { status: 422 });
  }
  if (typeof body.value !== 'string' || body.value.trim().length === 0) {
    return NextResponse.json({ error: 'value je povinný neprázdný string' }, { status: 422 });
  }

  try {
    const created = await prisma.attrOption.create({
      data: {
        attrKey: body.attrKey,
        value: body.value.trim(),
        label: typeof body.label === 'string' && body.label.length > 0 ? body.label : null,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        active: body.active === false ? false : true,
      },
    });
    await logActivity(session.id, 'attr_option.create', `${created.attrKey}:${created.value}`, '');
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: `Hodnota "${body.value}" pro ${body.attrKey} už existuje` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
