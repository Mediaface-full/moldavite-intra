/**
 * GET  /api/library/books/[id]/cover — servne JPG náhled (nebo 404 pokud chybí)
 * POST /api/library/books/[id]/cover — ADMIN: regenerate cover pro tuto knihu
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { readCover, hasCover, generateCover } from '@/lib/library/cover';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (!(await hasCover(bookId))) {
    return NextResponse.json({ error: 'No cover' }, { status: 404 });
  }

  try {
    const buffer = await readCover(bookId);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buffer.byteLength),
        // covers jsou immutable dokud se soubor nezmění → dlouhý cache s revalidate
        'Cache-Control': 'private, max-age=604800',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Cover read failed' }, { status: 500 });
  }
}

export async function POST(
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

  const ok = await generateCover(bookId, book.storageFilename, book.mimeType);
  if (!ok) {
    return NextResponse.json({
      error: book.mimeType === 'application/pdf'
        ? 'pdftoppm selhal — zkontroluj serverové logy'
        : `MIME ${book.mimeType} zatím nemá cover extractor (jen PDF)`,
    }, { status: 500 });
  }

  await logActivity(session.id, 'library.cover_regenerate', String(bookId));
  return NextResponse.json({ ok: true });
}
