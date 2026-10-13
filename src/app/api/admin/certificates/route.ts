/**
 * Admin → Certifikáty (Gideon 13. 10. 2026).
 *
 * GET  — stav: kolik kamenů má / nemá vystavený certifikát (certHash + certIssuedAt).
 * POST — vystaví certifikát VŠEM kamenům bez něj (jen DB: hash + datum, žádné PDF —
 *        PDF se vykresluje při každém otevření z aktuálního designu). Idempotentní.
 *
 * „Přegenerovat po změně designu" neexistuje záměrně: PDF se neukládá, nová podoba platí
 * hned pro všechny; hash a ověřovací odkaz (QR na vytištěných kusech) se NEMĚNÍ.
 * Čerstvé PDF pro tisk: GET /api/admin/certificates/zip.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { ensureCertificate } from '@/lib/items/certificate';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

const MISSING_WHERE: Prisma.ItemWhereInput = { OR: [{ certHash: '' }, { certIssuedAt: null }] };

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [total, missing, latest] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: MISSING_WHERE }),
    prisma.item.findFirst({
      where: { NOT: MISSING_WHERE },
      orderBy: { certIssuedAt: 'desc' },
      select: { id: true, evidNumber: true, certIssuedAt: true, box: { select: { code: true } } },
    }),
  ]);
  return NextResponse.json({
    total,
    issued: total - missing,
    missing,
    latest: latest ? { itemId: latest.id, catalogNumber: `${latest.box.code}-${latest.evidNumber}`, issuedAt: latest.certIssuedAt } : null,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const items = await prisma.item.findMany({
    where: MISSING_WHERE,
    select: { id: true, evidNumber: true, certHash: true, certIssuedAt: true, box: { select: { code: true } } },
    orderBy: { id: 'asc' },
  });

  let issued = 0;
  const failed: string[] = [];
  for (const it of items) {
    const catalogNumber = `${it.box.code}-${it.evidNumber}`;
    try {
      await ensureCertificate(prisma, it, catalogNumber);
      issued++;
    } catch (err) {
      console.error(`[certificates] vystavení pro ${catalogNumber} selhalo:`, err);
      failed.push(catalogNumber);
    }
  }

  await logActivity(session.id, 'certificate.issue_bulk', 'items', `Vystaveno ${issued} certifikátů${failed.length ? `, selhalo: ${failed.join(', ')}` : ''}`);
  return NextResponse.json({ issued, failed });
}
