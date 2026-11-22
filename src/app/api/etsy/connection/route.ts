/**
 * GET /api/etsy/connection — ADMIN: stav připojení (bez tokenů). DELETE — odpojit (tokeny se zahodí).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { etsyConfigured } from '@/lib/etsy/config';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { shopName: true, currencyCode: true, accessExpiresAt: true, connectedAt: true, disconnectedReason: true } });
  return NextResponse.json({
    configured: etsyConfigured(),
    connected: !!c && !c.disconnectedReason,
    shopName: c?.shopName ?? null,
    currencyCode: c?.currencyCode ?? null,
    connectedAt: c?.connectedAt ?? null,
    disconnectedReason: c?.disconnectedReason ?? null,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.etsyConnection.deleteMany({ where: { id: 1 } });
  await logActivity(session.id, 'etsy.disconnect', '', 'Obchod na Etsy odpojen, tokeny smazány');
  return NextResponse.json({ ok: true });
}
