/** POST /api/etsy/sync — ADMIN. { itemIds?: number[] } → zařadit do fronty a hned zpracovat (bez itemIds: všechny onEtsy). */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { enqueueEtsyJob, kickEtsy } from '@/lib/etsy/queue';
import { etsyConfigured } from '@/lib/etsy/config';
import { requireAdminApi } from '@/lib/etsy/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  if (!etsyConfigured()) return NextResponse.json({ error: 'Etsy není nastavené' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { itemIds?: unknown };
  let ids: number[];
  if (Array.isArray(body.itemIds)) {
    if (!body.itemIds.every((x) => Number.isInteger(x) && x > 0) || body.itemIds.length > 1000) return NextResponse.json({ error: 'itemIds: kladná celá čísla, max 1000' }, { status: 422 });
    ids = body.itemIds as number[];
  } else {
    ids = (await prisma.item.findMany({ where: { OR: [{ onEtsy: true }, { etsyListing: { isNot: null } }] }, select: { id: true } })).map((i) => i.id);
  }
  for (const id of ids) await enqueueEtsyJob(prisma, id, 'sync', 'manual');
  kickEtsy(ids.slice(0, 20));
  await logActivity(s.id, 'etsy.sync', '', `Propsat na Etsy: ${ids.length} kamenů`);
  return NextResponse.json({ queued: ids.length });
}
