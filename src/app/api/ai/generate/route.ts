/**
 * POST /api/ai/generate — jednotlivé AI generování textů kamene (modal). Jádro je v
 * `lib/ai/generateForItem.ts` (sdílené s hromadným generováním `lib/ai/bulkJobs.ts`).
 * PATCH — uložení schválených textů z modalu.
 */
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateTextsForItem, geminiConfigured, literatureLogSuffix } from '@/lib/ai/generateForItem';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pojistka proti omylu / smyčce, ne proti ceně: jedno generování stojí řádově haléře
  // (13. 10. 2026). Dřív 20/hod — Gideon narážel při ručním procházení kazety; hromadně
  // se generuje přes /api/ai/bulk, které tenhle limit neřeší.
  const limit = checkRateLimit(`ai:${session.id}`, 150, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Příliš mnoho AI generací. Zkus to za ${Math.ceil(limit.retryAfterSec / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  if (!geminiConfigured()) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  const body = await request.json();
  const itemId = Number(body?.itemId);
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  if (!Number.isInteger(itemId) || itemId <= 0 || !prompt) {
    return NextResponse.json({ error: 'Invalid itemId nebo prompt' }, { status: 422 });
  }

  const outcome = await generateTextsForItem(itemId, prompt);
  if (!outcome.ok) {
    if (outcome.status === 200) {
      return NextResponse.json({ success: false, rawText: outcome.rawText, error: outcome.error });
    }
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  await logActivity(session.id, 'ai.generate', outcome.catalogNumber, `AI generování pro ${outcome.catalogNumber}${literatureLogSuffix(outcome.literature)}`);

  return NextResponse.json({ success: true, result: outcome.result, literature: outcome.literature });
}

// Apply AI results to item
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const itemId = body.itemId;
  if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'itemId musí být kladné celé číslo' }, { status: 400 });
  }
  // Textová pole: jen string (nebo vynechané), délkový strop proti nesmyslným payloadům.
  const TEXT_FIELDS = ['name', 'nameEn', 'description', 'descriptionEn', 'longDescription', 'longDescriptionEn'] as const;
  const MAX_LEN: Record<(typeof TEXT_FIELDS)[number], number> = {
    name: 200, nameEn: 200, description: 5000, descriptionEn: 5000, longDescription: 50000, longDescriptionEn: 50000,
  };
  const data: Record<string, string> = {};
  for (const f of TEXT_FIELDS) {
    const v = body[f];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > MAX_LEN[f]) {
      return NextResponse.json({ error: `${f} musí být string (max ${MAX_LEN[f]} znaků)` }, { status: 400 });
    }
    data[f] = v;
  }

  const exists = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.item.update({ where: { id: itemId }, data });

  await logActivity(session.id, 'ai.apply', `${itemId}`, 'AI texty aplikovány');

  return NextResponse.json({ success: true });
}
