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

const TIME_BUDGET_MS = 40_000;
// Max knih na jedno volání — klient loopuje. Bez tohoto stropu první odpověď
// přišla až po 50 s a UI ukazovalo „0/0…" bez pohybu (Gideon 10. 9. 2026).
const MAX_PER_CALL = 5;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  // Kurzor: klient posílá `afterId` z předchozí odpovědi (`lastId`), server
  // pokračuje od dalšího id. Bez kurzoru by se trvale selhávající PDF zkoušelo
  // v každém volání znovu a batch by se nikdy neposunul dál.
  const afterId = Number.isInteger(body?.afterId) && body.afterId > 0 ? (body.afterId as number) : 0;

  const total = await prisma.book.count({ where: { mimeType: 'application/pdf' } });
  const books = await prisma.book.findMany({
    where: { mimeType: 'application/pdf', id: { gt: afterId } },
    orderBy: { id: 'asc' },
    select: { id: true, storageFilename: true, mimeType: true },
  });

  const started = Date.now();
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  let lastId = afterId;

  for (const book of books) {
    lastId = book.id;
    if (!force && (await hasCover(book.id))) {
      skipped++;
      processed++;
      continue;
    }
    const ok = await generateCover(book.id, book.storageFilename, book.mimeType);
    if (ok) generated++; else failed++;
    processed++;

    if (generated + failed >= MAX_PER_CALL || Date.now() - started > TIME_BUDGET_MS) break;
  }

  const remaining = books.length - processed;
  const done = remaining === 0;
  if (generated + failed > 0 || done) {
    await logActivity(session.id, done ? 'library.covers_generate_all' : 'library.covers_generate_partial', '', JSON.stringify({
      generated, skipped, failed, remaining, total,
    }));
  }
  return NextResponse.json({ done, generated, skipped, failed, remaining, total, lastId });
}
