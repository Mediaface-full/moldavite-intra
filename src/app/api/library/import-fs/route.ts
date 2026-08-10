/**
 * POST /api/library/import-fs — ADMIN only
 *
 * Body: { categoryId?: number, dryRun?: boolean }
 *
 * Scan LIBRARY_PATH, najde soubory co nemají UUID prefix (= nahrané mimo UI,
 * typicky přes FTP/File Station), přejmenuje na `<uuid>.<ext>` a vytvoří DB
 * záznam. Skip: UUID-format files (už v DB), nepodporované MIME.
 *
 * Použití: „Import z disku" tlačítko v /vseved/knihy pro admin.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { LIBRARY_ROOT, extensionForMime, SUPPORTED_MIME } from '@/lib/library/storage';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i;

// Reverse map: ext → mime (pro FS import kde známe jen příponu)
const MIME_BY_EXT: Record<string, string> = {};
for (const [mime, ext] of Object.entries(SUPPORTED_MIME)) MIME_BY_EXT[ext] = mime;

// Unused local extensionForMime — clean import (linter friendly)
void extensionForMime;

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const categoryIdRaw = body?.categoryId;
  let categoryId: number | null = null;
  if (typeof categoryIdRaw === 'number' && Number.isInteger(categoryIdRaw) && categoryIdRaw > 0) {
    const cat = await prisma.bookCategory.findUnique({ where: { id: categoryIdRaw } });
    if (!cat) return NextResponse.json({ error: `Kategorie ${categoryIdRaw} neexistuje` }, { status: 404 });
    categoryId = categoryIdRaw;
  }

  try {
    await fs.access(LIBRARY_ROOT);
  } catch {
    return NextResponse.json({
      error: `Adresář ${LIBRARY_ROOT} neexistuje. Zkontroluj bind mount v compose (./library:/data/library).`,
    }, { status: 500 });
  }

  const entries = await fs.readdir(LIBRARY_ROOT);
  const importable: Array<{ filename: string; ext: string; mime: string; size: number }> = [];
  const skipped: Array<{ filename: string; reason: string }> = [];

  for (const filename of entries) {
    if (UUID_PATTERN.test(filename)) {
      skipped.push({ filename, reason: 'UUID (už v DB)' });
      continue;
    }
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      skipped.push({ filename, reason: `.${ext || '(bez přípony)'}` });
      continue;
    }
    try {
      const stat = await fs.stat(path.join(LIBRARY_ROOT, filename));
      if (!stat.isFile()) {
        skipped.push({ filename, reason: 'není soubor' });
        continue;
      }
      importable.push({ filename, ext, mime, size: stat.size });
    } catch {
      skipped.push({ filename, reason: 'stat error' });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      importable: importable.map((f) => ({ filename: f.filename, mime: f.mime, size: f.size })),
      skipped,
    });
  }

  const imported: Array<{ id: number; title: string }> = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const f of importable) {
    try {
      const storageFilename = `${randomUUID()}.${f.ext}`;
      await fs.rename(
        path.join(LIBRARY_ROOT, f.filename),
        path.join(LIBRARY_ROOT, storageFilename),
      );
      const title = f.filename.replace(/\.[^.]+$/, '').trim() || f.filename;
      const book = await prisma.book.create({
        data: {
          title,
          filename: f.filename,
          storageFilename,
          mimeType: f.mime,
          size: f.size,
          categoryId,
          uploadedById: session.id,
        },
      });
      imported.push({ id: book.id, title: book.title });
    } catch (err) {
      errors.push({ filename: f.filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await logActivity(session.id, 'library.import_fs', String(categoryId ?? 'none'), JSON.stringify({
    imported: imported.length, errors: errors.length, skipped: skipped.length, categoryId,
  }));

  return NextResponse.json({ imported, errors, skipped });
}
