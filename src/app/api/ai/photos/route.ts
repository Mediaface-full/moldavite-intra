/**
 * POST /api/ai/photos — ADMIN. AI úprava e-shopových fotek (max 4 na kámen) na pozadí.
 *   body: { itemId: number } | { boxId: number }, overwrite?: boolean
 *   overwrite=false: jen fotky, které AI úpravu ještě nemají.
 *   202 { jobId, total } · 200 { jobId: null, total: 0 } když není co · 409 když už běh běží.
 * GET — běžící běh (tlačítko po reloadu naváže): { job }.
 * Logika: lib/photos/photoJobs.ts + enhanceItem.ts. Cena ~0,134 USD/fotka (gemini-3-pro-image, 2K).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { geminiConfigured } from '@/lib/ai/geminiClient';
import { getActivePhotoJob, startPhotoJob, MAX_ITEMS } from '@/lib/photos/photoJobs';
import { missingAiSlots } from '@/lib/photos/missing';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ job: getActivePhotoJob() });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!geminiConfigured()) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  const limit = checkRateLimit(`ai-photos:${session.id}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: `Příliš mnoho spuštění. Zkus to za ${limit.retryAfterSec} s.` }, { status: 429 });

  let body: { itemId?: unknown; boxId?: unknown; overwrite?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const overwrite = body.overwrite === true;
  const select = { id: true, evidNumber: true, photoPath: true, mainPhoto: true, shopPhotos: true, aiPhotos: true, box: { select: { code: true } } } as const;

  let label: string;
  let items: Array<{ id: number; photoPath: string; mainPhoto: number; shopPhotos: number[]; aiPhotos: unknown }>;
  if (body.itemId !== undefined) {
    const itemId = Number(body.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: 'itemId musí být kladné celé číslo' }, { status: 422 });
    const item = await prisma.item.findUnique({ where: { id: itemId }, select });
    if (!item) return NextResponse.json({ error: 'Kámen nenalezen' }, { status: 404 });
    label = `${item.box.code}-${item.evidNumber}`;
    items = [item];
  } else {
    const boxId = Number(body.boxId);
    if (!Number.isInteger(boxId) || boxId <= 0) return NextResponse.json({ error: 'Chybí itemId nebo boxId' }, { status: 422 });
    const box = await prisma.box.findUnique({ where: { id: boxId }, select: { code: true, items: { orderBy: { evidNumber: 'asc' }, where: { sold: false }, select } } });
    if (!box) return NextResponse.json({ error: 'Kazeta nenalezena' }, { status: 404 });
    label = box.code;
    items = box.items;
  }

  const targets = items.filter((i) => i.photoPath && (overwrite || missingAiSlots(i).length > 0));
  if (!targets.length) return NextResponse.json({ jobId: null, total: 0 });
  if (targets.length > MAX_ITEMS) return NextResponse.json({ error: `Max ${MAX_ITEMS} kamenů na jeden běh` }, { status: 422 });
  try {
    const job = startPhotoJob({ userId: session.id, label, itemIds: targets.map((i) => i.id), overwrite });
    return NextResponse.json({ jobId: job.id, total: job.total }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
