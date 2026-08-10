/**
 * POST /api/library/covers-generate-all — ADMIN
 *
 * Body: { force?: boolean }
 *   force=true  ... vygeneruje znovu i pro knihy co už cover mají
 *   force=false ... jen chybějící (default)
 *
 * Časový budget: 60s (Synology reverse proxy timeout). Pokud je knih hodně,
 * vrací { done: false, remaining: N } a klient loopuje.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { generateCover, hasCover } from '@/lib/library/cover';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TIME_BUDGET_MS = 50_000;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  const books = await prisma.book.findMany({
    where: { mimeType: 'application/pdf' },
    orderBy: { id: 'asc' },
    select: { id: true, storageFilename: true, mimeType: true, title: true },
  });

  const started = Date.now();
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const book of books) {
    if (!force && (await hasCover(book.id))) {
      skipped++;
      processed++;
      continue;
    }
    const ok = await generateCover(book.id, book.storageFilename, book.mimeType);
    if (ok) generated++; else failed++;
    processed++;

    if (Date.now() - started > TIME_BUDGET_MS) {
      // Vyčerpali jsme timebox — vrátíme co jsme udělali, klient dokončí dalším voláním
      await logActivity(session.id, 'library.covers_generate_partial', '', JSON.stringify({
        generated, skipped, failed, remaining: books.length - processed,
      }));
      return NextResponse.json({
        done: false,
        generated,
        skipped,
        failed,
        remaining: books.length - processed,
        total: books.length,
      });
    }
  }

  await logActivity(session.id, 'library.covers_generate_all', '', JSON.stringify({
    generated, skipped, failed, total: books.length,
  }));
  return NextResponse.json({
    done: true,
    generated,
    skipped,
    failed,
    remaining: 0,
    total: books.length,
  });
}
