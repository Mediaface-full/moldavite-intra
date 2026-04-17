import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { createHash, randomBytes } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

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

  // Title
  doc.fontSize(28).fillColor(darkGreen).font('Helvetica-Bold')
    .text('CERTIFICATE OF AUTHENTICITY', 50, 55, { align: 'center', width: W - 100 });

  // Subtitle
  doc.moveDown(0.4);
  doc.fontSize(14).fillColor('#555').font('Helvetica')
    .text('Natural Bohemian Moldavite', { align: 'center', width: W - 100 });

  doc.moveDown(0.2);
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

  const specs = [
    ['Mineral Species:', 'Tektite'],
    ['Variety:', 'Moldavite (Vltavín)'],
    ['Origin:', 'Southern Bohemia, Czech Republic'],
    ['Locality:', item.location ? `${item.location} - Czech Republic` : 'Czech Republic'],
    ['Weight:', `${weightG.toFixed(2)} g / ${weightCt.toFixed(2)} ct`],
  ];

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
