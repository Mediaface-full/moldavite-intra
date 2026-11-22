/** GET /api/etsy/alerts — ADMIN. Nevyřešené konflikty, odpojení a chyby listingů (pro červenou lištu a přehled). */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonSafe, requireAdminApi } from '@/lib/etsy/adminAuth';
import { etsyConfigured } from '@/lib/etsy/config';

export const runtime = 'nodejs';

export async function GET() {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  if (!etsyConfigured()) return NextResponse.json({ conflicts: [], disconnected: null, errors: 0 });
  const [conflicts, conn, errors] = await Promise.all([
    prisma.etsyOrder.findMany({ where: { conflict: true, resolvedAt: null }, orderBy: { processedAt: 'desc' }, select: { id: true, receiptId: true, conflictNote: true, processedAt: true } }),
    prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { disconnectedReason: true } }),
    prisma.etsyListing.count({ where: { state: 'error' } }),
  ]);
  return NextResponse.json(jsonSafe({ conflicts, disconnected: conn?.disconnectedReason ?? null, errors }));
}
