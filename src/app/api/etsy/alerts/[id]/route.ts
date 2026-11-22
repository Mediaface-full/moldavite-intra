/** POST /api/etsy/alerts/[id] — ADMIN. Označí konflikt jako vyřešený (lišta zmizí). */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { requireAdminApi } from '@/lib/etsy/adminAuth';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const r = await prisma.etsyOrder.updateMany({ where: { id, conflict: true, resolvedAt: null }, data: { resolvedAt: new Date() } });
  if (r.count) await logActivity(s.id, 'etsy.settings', '', `Konflikt Etsy objednávky #${id} označen jako vyřešený`);
  return NextResponse.json({ ok: r.count > 0 });
}
