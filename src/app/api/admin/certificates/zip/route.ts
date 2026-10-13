/**
 * GET /api/admin/certificates/zip?box=<id> | ?scope=all — ZIP s čerstvými PDF certifikáty
 * (ADMIN). Každé PDF se vykreslí z aktuálního designu, kamenům bez certifikátu se nejdřív
 * vystaví (ensureCertificate). Použití: tisk po změně designu, archiv kazety.
 *
 * Limit MAX_ITEMS na jeden ZIP — PDF se renderují v jednom požadavku: změřeno 0,4 s/PDF
 * (Mac, dev), NAS DS718+ počítej ~1 s/PDF, DSM reverse proxy má 60 s timeout → 50 PDF.
 * Větší sklad jde po kazetách (UI nabízí jen kazety).
 */
import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { ensureCertificate } from '@/lib/items/certificate';
import { renderCertificatePdf, certificateFilename } from '@/lib/items/certificatePdf';

export const runtime = 'nodejs';

const MAX_ITEMS = 50;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const boxParam = searchParams.get('box');
  const scope = searchParams.get('scope');
  let where: { boxId?: number } = {};
  let label = 'vse';
  if (boxParam !== null) {
    const boxId = Number(boxParam);
    if (!Number.isInteger(boxId) || boxId <= 0) return NextResponse.json({ error: 'box musí být kladné celé číslo' }, { status: 422 });
    const box = await prisma.box.findUnique({ where: { id: boxId }, select: { code: true } });
    if (!box) return NextResponse.json({ error: 'Kazeta nenalezena' }, { status: 404 });
    where = { boxId };
    label = box.code;
  } else if (scope !== 'all') {
    return NextResponse.json({ error: 'Zadej ?box=<id> nebo ?scope=all' }, { status: 422 });
  }

  const items = await prisma.item.findMany({ where, include: { box: true }, orderBy: [{ boxId: 'asc' }, { evidNumber: 'asc' }] });
  if (items.length === 0) return NextResponse.json({ error: 'Žádné kameny' }, { status: 404 });
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Příliš mnoho kamenů (${items.length}), max ${MAX_ITEMS} na jeden ZIP — stáhni po kazetách` }, { status: 422 });
  }

  const zip = new AdmZip();
  let issuedNow = 0;
  for (const item of items) {
    const catalogNumber = `${item.box.code}-${item.evidNumber}`;
    const hadCert = !!(item.certHash && item.certIssuedAt);
    const { certHash, certIssuedAt } = await ensureCertificate(prisma, item, catalogNumber);
    if (!hadCert) issuedNow++;
    const pdf = await renderCertificatePdf(item, certHash, certIssuedAt);
    zip.addFile(certificateFilename(catalogNumber), pdf);
  }

  await logActivity(session.id, 'certificate.zip', label, `ZIP ${items.length} certifikátů${issuedNow ? `, ${issuedNow} nově vystaveno` : ''}`);

  const buf = zip.toBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="certifikaty-${label}.zip"`,
      'Content-Length': String(buf.length),
    },
  });
}
