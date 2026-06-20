/**
 * GET /api/vseved/sources — list all documents (no chunks)
 * ADMIN-only (Vseved je celkove admin-only).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const documents = await prisma.vsevedDocument.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true, title: true, author: true, year: true, language: true,
      format: true, fileSize: true, chunkCount: true, status: true,
      statusError: true, tags: true, uploadedAt: true, indexedAt: true,
    },
  });

  return NextResponse.json({ documents });
}
