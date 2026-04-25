import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// Cached logo bytes — loaded once per process. PDFKit accepts the buffer
// directly so we don't depend on cwd at request time.
let LOGO_BUFFER: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (LOGO_BUFFER) return LOGO_BUFFER;
  for (const candidate of [
    path.join(process.cwd(), 'public', 'logo-pdf.png'),
    path.join(process.cwd(), '.next', 'standalone', 'public', 'logo-pdf.png'),
  ]) {
    try {
      LOGO_BUFFER = fs.readFileSync(candidate);
      return LOGO_BUFFER;
    } catch {
      /* try next */
    }
  }
  console.warn('[certificate] logo-pdf.png not found in public/');
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = parseInt(id);

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { box: true },
  });

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const weightG = Number(item.weight);
  const weightCt = Number(item.weightCt) || (weightG * 5);

  // Generate or reuse cert hash
  let certHash = item.certHash;
  // Generate hash + issue date on first generation, reuse on subsequent
  let certIssuedAt = item.certIssuedAt;
  if (!certHash) {
    certHash = createHash('sha256')
      .update(`${item.id}-${catalogNumber}-${randomBytes(8).toString('hex')}`)
      .digest('hex')
      .substring(0, 16);
    certIssuedAt = new Date();
    await prisma.item.update({ where: { id: itemId }, data: { certHash, certIssuedAt } });
  } else if (!certIssuedAt) {
    certIssuedAt = new Date();
    await prisma.item.update({ where: { id: itemId }, data: { certIssuedAt } });
  }

  const verifyBaseUrl = process.env.VERIFY_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const verifyUrl = `${verifyBaseUrl}/verify/${certHash}`;
  const issueDate = certIssuedAt!.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // QR code
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 100, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // Landscape A4
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const W = doc.page.width;   // 841
  const H = doc.page.height;  // 595
  const green = '#2d6e35';
  const darkGreen = '#1a3b21';
  const lightGreen = '#85c28d';

  // Background - white
  doc.rect(0, 0, W, H).fill('#FAFAF7');

  // Outer border - double line with corner decorations
  doc.rect(25, 25, W - 50, H - 50).lineWidth(2.5).stroke(green);
  doc.rect(30, 30, W - 60, H - 60).lineWidth(0.5).stroke(lightGreen);

  // Corner decorations (L-shaped)
  const corners = [[35, 35], [W - 55, 35], [35, H - 55], [W - 55, H - 55]];
  for (const [cx, cy] of corners) {
    doc.save();
    doc.lineWidth(1.5).strokeColor(green);
    // horizontal
    doc.moveTo(cx, cy).lineTo(cx + 20, cy).stroke();
    // vertical
    doc.moveTo(cx, cy).lineTo(cx, cy + 20).stroke();
    doc.restore();
  }
  // Fix other corners
  doc.lineWidth(1.5).strokeColor(green);
  doc.moveTo(W - 35, 35).lineTo(W - 55, 35).stroke();
  doc.moveTo(W - 35, 35).lineTo(W - 35, 55).stroke();
  doc.moveTo(35, H - 35).lineTo(55, H - 35).stroke();
  doc.moveTo(35, H - 35).lineTo(35, H - 55).stroke();
  doc.moveTo(W - 35, H - 35).lineTo(W - 55, H - 35).stroke();
  doc.moveTo(W - 35, H - 35).lineTo(W - 35, H - 55).stroke();

  // Logo — Bohemian Moldavite branding centered at the top
  const logo = getLogoBuffer();
  let titleY = 55;
  if (logo) {
    // Logo source is 1500×750 (2:1). Render at 160×80 centered.
    const logoW = 160;
    const logoH = 80;
    doc.image(logo, (W - logoW) / 2, 45, { width: logoW, height: logoH });
    titleY = 45 + logoH + 12;
  }

  // Title
  doc.fontSize(24).fillColor(darkGreen).font('Helvetica-Bold')
    .text('CERTIFICATE OF AUTHENTICITY', 50, titleY, { align: 'center', width: W - 100 });

  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#888').font('Helvetica')
    .text(`Serial Number: ${catalogNumber}`, { align: 'center', width: W - 100 });

  // Divider
  doc.moveDown(0.8);
  const divY = doc.y;
  doc.moveTo(70, divY).lineTo(W - 70, divY).lineWidth(1).stroke(lightGreen);

  // Left column - Specifications
  const leftX = 70;
  const rightColX = 480;
  let specY = divY + 20;

  doc.fontSize(13).fillColor(darkGreen).font('Helvetica-Bold')
    .text('SPECIFICATIONS', leftX, specY);
  specY += 25;

  const shape = getPasShape(item.pasShape);
  const specs: Array<[string, string]> = [
    ['Mineral Species:', 'Tektite'],
    ['Variety:', 'Moldavite (Vltavín)'],
    ['Origin:', 'Southern Bohemia, Czech Republic'],
    ['Locality:', item.location ? `${item.location} - Czech Republic` : 'Czech Republic'],
    ['Weight:', `${weightG.toFixed(2)} g / ${weightCt.toFixed(2)} ct`],
  ];
  if (shape) {
    specs.push(['Primary Shape:', `${shape.en} / ${shape.cz}`]);
  }

  for (const [label, value] of specs) {
    doc.fontSize(10).fillColor('#444').font('Helvetica-Bold')
      .text(label, leftX, specY, { continued: false, width: 120 });
    doc.fontSize(10).fillColor('#222').font('Helvetica')
      .text(value, leftX + 125, specY, { width: 300 });
    specY += 18;
  }

  // Declaration
  specY += 15;
  doc.fontSize(13).fillColor(darkGreen).font('Helvetica-Bold')
    .text('DECLARATION OF AUTHENTICITY', leftX, specY);
  specY += 22;

  doc.fontSize(9).fillColor('#333').font('Helvetica')
    .text(
      'This document officially confirms that the accompanying specimen is a ',
      leftX, specY, { continued: true, width: 380 }
    );
  doc.font('Helvetica-Bold').text('100% natural, authentic Bohemian Moldavite', { continued: true });
  doc.font('Helvetica').text(
    '. This rare tektite was formed approximately 14.7 million years ago during a meteorite impact. It has been legally sourced from the renowned Moldavite fields of South Bohemia and is guaranteed to be untreated, unheated, and unmodified by human hand, displaying characteristic, unique natural sculpturing, surface pitting, and internal lechatelierite inclusions.',
    { width: 380, lineGap: 2 }
  );

  // QR code - right side
  doc.image(qrBuffer, rightColX + 60, divY + 30, { width: 80 });
  doc.fontSize(7).fillColor('#999').font('Helvetica')
    .text('Scan to verify authenticity', rightColX + 40, divY + 115, { width: 120, align: 'center' });

  // Bottom section
  const bottomY = H - 80;
  doc.moveTo(70, bottomY).lineTo(W - 70, bottomY).lineWidth(0.5).stroke(lightGreen);

  doc.fontSize(10).fillColor('#333').font('Helvetica')
    .text('Authorized Signature: ______________________', leftX, bottomY + 15);

  doc.fontSize(10).fillColor('#333').font('Helvetica')
    .text(`Date of Issue: ${issueDate}`, rightColX, bottomY + 15, { width: 250, align: 'right' });

  doc.end();

  const pdfBuffer = await pdfPromise;

  await logActivity(session.id, 'certificate.generate', catalogNumber, `Certifikát pro ${catalogNumber}`);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="certificate-${catalogNumber}.pdf"`,
    },
  });
}
