/**
 * PATCH /api/library/books/[id]  — ADMIN, { title?, categoryId? }
 * DELETE /api/library/books/[id] — ADMIN, smaže DB záznam + soubor na disku
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { deleteBookFile } from '@/lib/library/storage';
import { deleteCover } from '@/lib/library/cover';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.title === 'string') {
    const t = body.title.trim();
    if (!t || t.length > 200) return NextResponse.json({ error: 'title 1–200 znaků' }, { status: 422 });
    data.title = t;
  }
  if (body?.categoryId !== undefined) {
    if (body.categoryId === null) data.categoryId = null;
    else {
      const n = Number(body.categoryId);
      if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: 'categoryId invalid' }, { status: 422 });
      data.categoryId = n;
    }
  }
  const book = await prisma.book.update({ where: { id: bookId }, data });
  await logActivity(session.id, 'library.book.update', book.title, JSON.stringify(Object.keys(data)));
  return NextResponse.json(book);
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
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.book.delete({ where: { id: bookId } });
  await deleteBookFile(book.storageFilename);
  await deleteCover(bookId);
  await logActivity(session.id, 'library.book.delete', book.title, JSON.stringify({ filename: book.filename }));
  return NextResponse.json({ success: true });
}
