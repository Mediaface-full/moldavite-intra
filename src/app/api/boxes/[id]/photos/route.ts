import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { detectFileType, extensionForType, isSafePathSegment } from '@/lib/fileValidation';
import * as fs from 'fs';
import * as path from 'path';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const boxId = Number.parseInt(id, 10);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return NextResponse.json({ error: 'Invalid box id' }, { status: 400 });
  }

  const box = await prisma.box.findUnique({ where: { id: boxId } });
  if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
  if (!isSafePathSegment(box.code)) {
    return NextResponse.json({ error: 'Invalid box code' }, { status: 500 });
  }

  const formData = await request.formData();
  const files = formData.getAll('photos') as File[];

  if (files.length === 0 || files.length > 5) {
    return NextResponse.json({ error: 'Povoleno 1-5 fotek' }, { status: 400 });
  }

  const photosRoot = path.resolve(PHOTOS_PATH);
  const boxPhotoDir = path.resolve(path.join(photosRoot, box.code, '_box_photos'));
  if (!boxPhotoDir.startsWith(photosRoot + path.sep) && boxPhotoDir !== photosRoot) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 500 });
  }
  if (!fs.existsSync(boxPhotoDir)) {
    fs.mkdirSync(boxPhotoDir, { recursive: true });
  }

  const buffers: { type: string; ext: string; buf: Buffer }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Soubor příliš velký (max 10MB)' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Soubor příliš velký (max 10MB)' }, { status: 400 });
    }
    const detected = detectFileType(buf);
    if (!detected) {
      return NextResponse.json({ error: 'Nepodporovaný formát (dovoleno: JPEG/PNG/WebP/PDF)' }, { status: 400 });
    }
    buffers.push({ type: detected, ext: extensionForType(detected), buf });
  }

  const photoPaths: string[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const { ext, buf } = buffers[i];
    const filename = `box_${i + 1}${ext}`;
    const filePath = path.join(boxPhotoDir, filename);
    fs.writeFileSync(filePath, buf);
    photoPaths.push(`${box.code}/_box_photos/${filename}`);
  }

  await prisma.box.update({ where: { id: boxId }, data: { photos: photoPaths } });
  await logActivity(session.id, 'box.photos', box.code, `Nahrány ${files.length} fotky`);

  return NextResponse.json({ photos: photoPaths });
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
  const boxId = Number.parseInt(id, 10);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return NextResponse.json({ error: 'Invalid box id' }, { status: 400 });
  }
  await prisma.box.update({ where: { id: boxId }, data: { photos: [] } });
  return NextResponse.json({ success: true });
}
