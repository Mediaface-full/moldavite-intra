import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

/**
 * GET /api/sellers          → list (pro dropdown v Order/Box form, aktivní)
 * GET /api/sellers?all=1    → include inactive
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('all') === '1';

  const sellers = await prisma.seller.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      _count: { select: { orders: true, boxes: true } },
    },
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
  });
  return NextResponse.json(sellers);
}

/**
 * POST /api/sellers — vytvořit (jen ADMIN).
 * Body: { firstName, lastName?, alias?, phone?, email?, note? }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const alias = typeof body.alias === 'string' ? body.alias.trim() : '';
  if (firstName.length === 0 && lastName.length === 0 && alias.length === 0) {
    return NextResponse.json({ error: 'Vyplň alespoň jméno, příjmení nebo krycí jméno' }, { status: 422 });
  }

  const seller = await prisma.seller.create({
    data: {
      firstName,
      lastName,
      alias,
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim() : '',
      note: typeof body.note === 'string' ? body.note : '',
      active: body.active === false ? false : true,
    },
  });
  await logActivity(session.id, 'seller.create', String(seller.id), JSON.stringify({ alias: seller.alias || `${seller.firstName} ${seller.lastName}`.trim() }));
  return NextResponse.json(seller, { status: 201 });
}
