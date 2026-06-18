/**
 * POST   /api/items/[id]/photos — nahraje 1–10 fotek do složky <box>/<evidNumber>/.
 *                                 Číslování pokračuje od max existující (01, 02, ...).
 * DELETE /api/items/[id]/photos?index=NN — smaže konkrétní foto (NN.jpg/.png/.webp).
 *                                          ADMIN-only.
 *
 * Layout na disku:
 *   <PHOTOS_PATH>/<box.code>/<item.evidNumber>/01.jpg
 *   <PHOTOS_PATH>/<box.code>/<item.evidNumber>/02.jpg
 *   ...
 *
 * Tento endpoint je sourozenec FTP workflow A — slouží pro rychlé opravy
 * a kameny, které ještě nejsou nahrané z fotostudia (varianta B v Gideonově plánu).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { detectFileType, extensionForType, isSafePathSegment } from '@/lib/fileValidation';
import * as fs from 'fs';
import * as path from 'path';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function nextPhotoIndex(dir: string): number {
  if (!fs.existsSync(dir)) return 1;
  const existing = fs.readdirSync(dir)
    .map((f) => {
      const m = f.match(/^(\d{1,3})\.(jpe?g|png|webp)$/i);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const itemId = Number.parseInt(id, 10);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { box: { select: { code: true } } },
  });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  if (!isSafePathSegment(item.box.code) || !isSafePathSegment(item.evidNumber)) {
    return NextResponse.json({ error: 'Invalid box code or evidNumber' }, { status: 500 });
  }

  const formData = await request.formData();
  const files = formData.getAll('photos') as File[];
  if (files.length === 0 || files.length > 10) {
    return NextResponse.json({ error: 'Povoleno 1–10 fotek na request' }, { status: 400 });
  }

  // Path traversal guard.
  const photosRoot = path.resolve(PHOTOS_PATH);
  const itemDir = path.resolve(path.join(photosRoot, item.box.code, item.evidNumber));
  if (!itemDir.startsWith(photosRoot + path.sep)) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 500 });
  }
  if (!fs.existsSync(itemDir)) {
    fs.mkdirSync(itemDir, { recursive: true });
  }

  const buffers: { ext: string; buf: Buffer }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Soubor "${file.name}" je větší než 10 MB` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Soubor příliš velký (max 10 MB)' }, { status: 400 });
    }
    const detected = detectFileType(buf);
    if (!detected || detected === 'application/pdf') {
      return NextResponse.json({ error: 'Pouze JPEG/PNG/WebP (PDF zde ne)' }, { status: 400 });
    }
    buffers.push({ ext: extensionForType(detected), buf });
  }

  let nextIdx = nextPhotoIndex(itemDir);
  const written: string[] = [];
  for (const { ext, buf } of buffers) {
    const filename = `${String(nextIdx).padStart(2, '0')}${ext}`;
    fs.writeFileSync(path.join(itemDir, filename), buf);
    written.push(filename);
    nextIdx++;
  }

  // Pokud Item nemá photoPath, doplň ho (např. starší kameny). Pokud má, nech.
  if (!item.photoPath) {
    await prisma.item.update({
      where: { id: item.id },
      data: { photoPath: `${item.box.code}/${item.evidNumber}` },
    });
  }

  await logActivity(
    session.id,
    'item.photos_upload',
    `${item.box.code}-${item.evidNumber}`,
    JSON.stringify({ added: written.length, files: written }),
  );

  return NextResponse.json({ success: true, added: written.length, files: written });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const itemId = Number.parseInt(id, 10);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const indexParam = searchParams.get('index');
  if (!indexParam) {
    return NextResponse.json({ error: 'Chybí parametr ?index=NN' }, { status: 400 });
  }
  const idx = parseInt(indexParam, 10);
  if (!Number.isInteger(idx) || idx < 1 || idx > 999) {
    return NextResponse.json({ error: 'index musí být 1–999' }, { status: 400 });
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { box: { select: { code: true } } },
  });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  if (!isSafePathSegment(item.box.code) || !isSafePathSegment(item.evidNumber)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 500 });
  }

  const photosRoot = path.resolve(PHOTOS_PATH);
  const itemDir = path.resolve(path.join(photosRoot, item.box.code, item.evidNumber));
  if (!itemDir.startsWith(photosRoot + path.sep)) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 500 });
  }

  const padded = String(idx).padStart(2, '0');
  let removed = 0;
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const p = path.join(itemDir, padded + ext);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); removed++; } catch { /* ignore */ }
    }
  }

  await logActivity(
    session.id,
    'item.photos_delete',
    `${item.box.code}-${item.evidNumber}`,
    `index=${padded}, removed=${removed}`,
  );

  return NextResponse.json({ success: true, removed });
}
