/**
 * POST /api/items/[id]/ai-photos — ADMIN. Rozhodnutí o AI úpravě jedné fotky.
 *   body: { slot: 1–24, action: 'approve' | 'reject' }
 *   approve → AI verze jde do e-shopu i přes nižší shodu obrysu; reject → soubor pryč, e-shop dostane originál.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { decideAiPhoto } from '@/lib/photos/enhanceItem';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const itemId = Number.parseInt(id, 10);
  if (!Number.isInteger(itemId) || itemId <= 0 || String(itemId) !== id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  let body: { slot?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const slot = body.slot;
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 24) return NextResponse.json({ error: 'slot 1–24' }, { status: 422 });
  if (body.action !== 'approve' && body.action !== 'reject') return NextResponse.json({ error: "action: 'approve' | 'reject'" }, { status: 422 });
  const r = await decideAiPhoto(itemId, slot, body.action, session.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 404 });
}
