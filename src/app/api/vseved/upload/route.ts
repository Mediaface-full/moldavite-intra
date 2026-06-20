/**
 * POST /api/vseved/upload (multipart/form-data)
 *
 * Vstup:
 *   file: File (.txt nebo .epub, max 50 MB)
 *   title: string (povinne)
 *   author?: string
 *   year?: number
 *   language?: 'cs' | 'en' (default 'cs')
 *   tags?: string[]  (JSON-stringified)
 *
 * Vystup: 202 Accepted { documentId }
 * Processing pokracuje v backgroundu via processDocument fire-and-forget.
 *
 * Bezpecnost:
 * - ADMIN-only
 * - File size <= 50 MB
 * - Filename whitelist regex (display title only, real path je <id>.<format>)
 * - Magic bytes overeny pro epub (PK zip signature)
 */
import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { ensureUploadDir, getDocumentPath, isSafeFilename } from '@/lib/vseved/storage';
import { processDocument } from '@/lib/vseved/processDocument';

// Pouzij Node.js runtime — background Promise (processDocument) musi prezit po
// response sent. Edge runtime promise kill po response.
export const runtime = 'nodejs';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 422 });
  }

  // Validate size
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Soubor je vetsi nez 50 MB (${file.size} B)` }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Prazdny soubor' }, { status: 422 });
  }

  // Validate filename + derive format
  const originalName = file.name || 'unknown';
  if (!isSafeFilename(originalName)) {
    return NextResponse.json({ error: 'Nepripustny nazev souboru (jen pismena, cisla, pomlcky, mezery)' }, { status: 422 });
  }
  const lower = originalName.toLowerCase();
  let format: 'txt' | 'epub';
  if (lower.endsWith('.txt')) format = 'txt';
  else if (lower.endsWith('.epub')) format = 'epub';
  else return NextResponse.json({ error: 'Povolen jen .txt nebo .epub' }, { status: 422 });

  // Validate magic bytes for epub (PK zip signature 50 4B 03 04)
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (format === 'epub') {
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      return NextResponse.json({ error: 'Soubor neni validni epub (chyba PK signature)' }, { status: 422 });
    }
  }

  // Parse other fields
  const title = String(formData.get('title') ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title je povinne' }, { status: 422 });
  }
  const author = String(formData.get('author') ?? '').trim();
  const yearRaw = formData.get('year');
  const year = yearRaw ? Number.parseInt(String(yearRaw), 10) : null;
  if (year !== null && (!Number.isInteger(year) || year < 0 || year > 3000)) {
    return NextResponse.json({ error: 'Year musi byt cele cislo 0-3000' }, { status: 422 });
  }
  const language = String(formData.get('language') ?? 'cs');
  if (language !== 'cs' && language !== 'en') {
    return NextResponse.json({ error: 'Language musi byt cs nebo en' }, { status: 422 });
  }
  let tags: string[] = [];
  const tagsRaw = formData.get('tags');
  if (tagsRaw) {
    try {
      const parsed = JSON.parse(String(tagsRaw));
      if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string').slice(0, 20);
    } catch {
      // ignore — tags optional
    }
  }

  // Create DB row
  const doc = await prisma.vsevedDocument.create({
    data: {
      title,
      author,
      year: year ?? undefined,
      language,
      sourceFile: originalName,
      format,
      fileSize: file.size,
      tags,
      uploadedBy: session.id,
      status: 'PENDING',
    },
  });

  // Save file to disk
  await ensureUploadDir();
  const filePath = getDocumentPath(doc.id, format);
  await writeFile(filePath, bytes);

  // Fire-and-forget background processing
  void processDocument(doc.id).catch((err) => {
    console.error(`[vseved] processDocument(${doc.id}) failed:`, err);
  });

  await logActivity(session.id, 'vseved.upload', String(doc.id), JSON.stringify({ title, format, size: file.size }));

  return NextResponse.json({ documentId: doc.id }, { status: 202 });
}
