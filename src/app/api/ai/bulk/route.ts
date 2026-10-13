/**
 * POST /api/ai/bulk — ADMIN. Spustí hromadné AI generování textů pro kameny kazety na pozadí.
 *   body: { boxId: number, overwrite?: boolean, prompt?: string }
 *   overwrite=false (default): jen kameny, kterým chybí některý z 6 textů; plní se jen prázdná pole.
 *   202 { jobId, total } · 200 { jobId: null, total: 0 } když není co · 409 když už job běží.
 * GET /api/ai/bulk — běžící job (aby tlačítko po reloadu stránky navázalo), { job: BulkJob | null }.
 * Průběh: GET /api/ai/bulk/[jobId]. Logika: lib/ai/bulkJobs.ts.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { DEFAULT_PROMPT } from '@/lib/ai/defaultPrompt';
import { geminiConfigured } from '@/lib/ai/generateForItem';
import { isMissingTexts } from '@/lib/ai/bulkFields';
import { getActiveBulkJob, startBulkJob, MAX_ITEMS } from '@/lib/ai/bulkJobs';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ job: getActiveBulkJob() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!geminiConfigured()) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });

  // Pojistka proti omylem opakovanému spouštění — jeden běh zvládne celou kazetu.
  const limit = checkRateLimit(`ai-bulk:${session.id}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: `Příliš mnoho spuštění. Zkus to za ${limit.retryAfterSec} s.` }, { status: 429 });
  }

  let body: { boxId?: unknown; overwrite?: unknown; prompt?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const boxId = Number(body.boxId);
  if (!Number.isInteger(boxId) || boxId <= 0) return NextResponse.json({ error: 'boxId musí být kladné celé číslo' }, { status: 422 });
  const overwrite = body.overwrite === true;
  const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : DEFAULT_PROMPT;
  if (prompt.length > 20_000) return NextResponse.json({ error: 'Prompt je příliš dlouhý' }, { status: 422 });

  const box = await prisma.box.findUnique({
    where: { id: boxId },
    select: {
      id: true, code: true,
      items: {
        orderBy: { evidNumber: 'asc' },
        select: { id: true, name: true, nameEn: true, description: true, descriptionEn: true, longDescription: true, longDescriptionEn: true },
      },
    },
  });
  if (!box) return NextResponse.json({ error: 'Kazeta nenalezena' }, { status: 404 });

  const targets = overwrite ? box.items : box.items.filter((i) => isMissingTexts(i));
  if (targets.length === 0) return NextResponse.json({ jobId: null, total: 0 });
  if (targets.length > MAX_ITEMS) return NextResponse.json({ error: `Max ${MAX_ITEMS} kamenů na jeden běh` }, { status: 422 });

  try {
    const job = startBulkJob({ userId: session.id, boxCode: box.code, itemIds: targets.map((i) => i.id), prompt, overwrite });
    return NextResponse.json({ jobId: job.id, total: job.total }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
