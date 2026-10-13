/**
 * GET /api/certificate/[id] — PDF certifikát kamene (přihlášený uživatel). Vystaví certHash
 * při prvním otevření (lib/items/certificate.ts) a vykreslí PDF z AKTUÁLNÍHO designu
 * (lib/items/certificatePdf.ts) — PDF se neukládá, takže změna designu platí hned pro všechny.
 */
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { ensureCertificate } from '@/lib/items/certificate';
import { renderCertificatePdf, certificateFilename } from '@/lib/items/certificatePdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { box: true },
  });

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;

  // Vystavit nebo znovu použít certifikát (sdílené s prodejem z e-shopu — lib/items/certificate.ts)
  const { certHash, certIssuedAt } = await ensureCertificate(prisma, item, catalogNumber);

  const pdfBuffer = await renderCertificatePdf(item, certHash, certIssuedAt);

  await logActivity(session.id, 'certificate.generate', catalogNumber, `Certifikát pro ${catalogNumber}`);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${certificateFilename(catalogNumber)}"`,
    },
  });
}
