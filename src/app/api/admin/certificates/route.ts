/**
 * Admin → Certifikáty (Gideon 13. 10. 2026).
 *
 * GET — stav: kolik kamenů má / nemá vystavený certifikát (certHash + certIssuedAt) a poslední
 * vystavený (náhled aktuálního designu PDF).
 *
 * Hromadné „vystavit chybějící" bylo odstraněno (Gideon 13. 10.): PDF se neukládá, číslo
 * certifikátu vznikne samo při prvním otevření PDF nebo při prodeji přes e-shop. „Přegenerovat
 * po změně designu" neexistuje záměrně — každé otevření vykreslí aktuální design, hash a
 * ověřovací odkaz (QR na vytištěných kusech) se nemění. Čerstvá PDF k tisku: ./zip.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
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
