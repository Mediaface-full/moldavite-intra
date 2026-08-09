/**
 * GET  /api/library/books?categoryId=X — list všech knih (auth required).
 *      Bez `categoryId` vrátí všechny + kategorii vč. `Bez kategorie` skupinou (null).
 * POST /api/library/books — ADMIN only, multipart form:
 *      - `files`  : víc File objektů (bulk upload)
 *      - `categoryId` : optional integer (pro celý batch)
 *      Vrací { uploaded: number, errors: [{ filename, message }] }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import {
  extensionForMime, newStorageFilename, writeBookFile, ensureLibraryDir,
} from '@/lib/library/storage';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per soubor

// Next 16 Route Handlers: explicit nodejs runtime pro velké multipart uploady.
// Bez tohoto může edge runtime hodit body size limit i pro malé PDF.
export const runtime = 'nodejs';
// Zvýš timeout na 5 min — velké PDF přes pomalejší Synology síť.
export const maxDuration = 300;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoryIdRaw = searchParams.get('categoryId');
  const where: Record<string, unknown> = {};
  if (categoryIdRaw !== null && categoryIdRaw !== '') {
    const n = Number(categoryIdRaw);
    if (Number.isInteger(n)) where.categoryId = n === 0 ? null : n;
  }

  const books = await prisma.book.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  return NextResponse.json(books);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[library/books POST] formData parse failed:', msg);
    return NextResponse.json({
      error: `Nešlo přečíst multipart form (${msg}). Zkontroluj velikost — reverzní proxy může mít client_max_body_size limit.`,
    }, { status: 400 });
  }

  const rawFiles = form.getAll('files');
  const files = rawFiles.filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({
      error: `Žádné soubory pod klíčem "files" v form-datě. Přijato ${rawFiles.length} položek (typy: ${rawFiles.map((v) => typeof v).join(', ')}).`,
    }, { status: 400 });
  }

  const categoryIdRaw = form.get('categoryId');
  let categoryId: number | null = null;
  if (typeof categoryIdRaw === 'string' && categoryIdRaw.trim() !== '') {
    const n = Number(categoryIdRaw);
    if (Number.isInteger(n) && n > 0) {
      const catExists = await prisma.bookCategory.findUnique({ where: { id: n } });
      if (!catExists) return NextResponse.json({ error: `Kategorie ${n} neexistuje` }, { status: 404 });
      categoryId = n;
    }
  }

  await ensureLibraryDir();

  const errors: Array<{ filename: string; message: string }> = [];
  const uploaded: Array<{ id: number; title: string }> = [];

  for (const file of files) {
    const originalName = file.name || 'nepojmenováno';
    try {
      if (file.size === 0) {
        errors.push({ filename: originalName, message: 'Prázdný soubor' });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push({ filename: originalName, message: `Příliš velký (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` });
        continue;
      }
      const ext = extensionForMime(file.type);
      if (!ext) {
        errors.push({ filename: originalName, message: `Nepodporovaný formát (${file.type || 'neznámý'})` });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const storageFilename = newStorageFilename(ext);
      await writeBookFile(storageFilename, buffer);

      // Title = filename bez přípony (default). User může later přejmenovat.
      const title = originalName.replace(/\.[^.]+$/, '').trim() || originalName;

      const book = await prisma.book.create({
        data: {
          title,
          filename: originalName,
          storageFilename,
          mimeType: file.type,
          size: file.size,
          categoryId,
          uploadedById: session.id,
        },
      });
      uploaded.push({ id: book.id, title: book.title });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ filename: originalName, message: msg });
    }
  }

  await logActivity(
    session.id,
    'library.book.upload',
    String(categoryId ?? 'none'),
    JSON.stringify({ uploaded: uploaded.length, errors: errors.length, categoryId }),
  );

  return NextResponse.json({ uploaded, errors });
}
