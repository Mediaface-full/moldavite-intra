/**
 * PATCH  /api/library/categories/[id] — ADMIN, { name?, sortOrder? }
 * DELETE /api/library/categories/[id] — ADMIN. Knihy v kategorii se stanou „bez kategorie"
 *                                       (onDelete: SetNull).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const catId = Number(id);
  if (!Number.isInteger(catId) || catId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 60) {
      return NextResponse.json({ error: 'name 1–60 znaků' }, { status: 422 });
    }
    data.name = name;
  }
  if (typeof body?.sortOrder === 'number') data.sortOrder = body.sortOrder;

  try {
    const cat = await prisma.bookCategory.update({ where: { id: catId }, data });
    await logActivity(session.id, 'library.category.update', cat.name, JSON.stringify(Object.keys(data)));
    return NextResponse.json(cat);
  } catch {
    return NextResponse.json({ error: 'Kategorie neexistuje nebo duplicate name' }, { status: 409 });
  }
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
  const catId = Number(id);
  if (!Number.isInteger(catId) || catId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const cat = await prisma.bookCategory.findUnique({ where: { id: catId } });
  if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.bookCategory.delete({ where: { id: catId } });
  await logActivity(session.id, 'library.category.delete', cat.name);
  return NextResponse.json({ success: true });
}
