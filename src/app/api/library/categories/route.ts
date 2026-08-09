/**
 * GET  /api/library/categories — všechny (auth required)
 * POST /api/library/categories — ADMIN only, body { name, sortOrder? }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const cats = await prisma.bookCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { books: true } } },
  });
  return NextResponse.json(cats);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name je povinné' }, { status: 422 });
  if (name.length > 60) return NextResponse.json({ error: 'name max 60 znaků' }, { status: 422 });

  const exists = await prisma.bookCategory.findUnique({ where: { name } });
  if (exists) return NextResponse.json({ error: `Kategorie „${name}" už existuje` }, { status: 409 });

  const sortOrder = typeof body?.sortOrder === 'number' ? body.sortOrder : 0;
  const cat = await prisma.bookCategory.create({ data: { name, sortOrder } });
  await logActivity(session.id, 'library.category.create', name, JSON.stringify({ sortOrder }));
  return NextResponse.json(cat);
}
