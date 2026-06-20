/**
 * GET    /api/vseved/sources/[id] — single document metadata
 * DELETE /api/vseved/sources/[id] — cascade delete chunks + file
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { deleteDocumentFile } from '@/lib/vseved/storage';

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const doc = await prisma.vsevedDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(doc);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await prisma.vsevedDocument.findUnique({
    where: { id },
    select: { id: true, format: true, title: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.format !== 'txt' && existing.format !== 'epub') {
    return NextResponse.json({ error: 'Unknown format on disk' }, { status: 500 });
  }

  // Cascade delete chunks via Prisma onDelete: Cascade
  await prisma.vsevedDocument.delete({ where: { id } });

  // Delete file (ignore ENOENT)
  await deleteDocumentFile(id, existing.format);

  await logActivity(session.id, 'vseved.delete', String(id), JSON.stringify({ title: existing.title }));

  return NextResponse.json({ success: true });
}
