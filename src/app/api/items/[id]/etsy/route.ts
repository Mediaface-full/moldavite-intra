/** GET /api/items/[id]/etsy — stav listingu kamene na Etsy (pro kartu Etsy na detailu kamene). */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { jsonSafe } from '@/lib/etsy/adminAuth';
import { etsyConfigured } from '@/lib/etsy/config';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const itemId = Number((await params).id);
  if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const [listing, pending] = await Promise.all([
    prisma.etsyListing.findUnique({ where: { itemId }, select: { listingId: true, state: true, blockedReason: true, lastSyncAt: true, lastError: true, priceSent: true } }),
    prisma.etsyJob.count({ where: { itemId, doneAt: null } }),
  ]);
  return NextResponse.json(jsonSafe({ configured: etsyConfigured(), listing, pending }));
}
