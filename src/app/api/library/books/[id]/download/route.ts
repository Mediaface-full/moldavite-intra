/**
 * GET /api/library/books/[id]/download — auth required, stream soubor
 * Content-Disposition: inline (browser otevře v tabu pokud podporuje formát)
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { readBookFile } from '@/lib/library/storage';

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
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readBookFile(book.storageFilename);
  } catch {
    return NextResponse.json({ error: 'Soubor na disku chybí' }, { status: 404 });
  }

  // Content-Disposition: inline pro PDF (browser preview), attachment pro EPUB
  // (browser ho neumi otevrit inline, jen download).
  const disposition = book.mimeType === 'application/pdf' ? 'inline' : 'attachment';
  // filename* podle RFC 5987 aby proslo diakriticke znaky
  const encFilename = encodeURIComponent(book.filename);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': book.mimeType,
      'Content-Length': String(book.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encFilename}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
