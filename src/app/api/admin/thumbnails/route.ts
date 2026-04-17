import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const CACHE_PATH = process.env.THUMB_CACHE_PATH || path.join(PHOTOS_PATH, '..', '.photos-cache');
const WARM_WIDTHS = [192, 384]; // list thumb + retina variant

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stat = await collectStats();
  return NextResponse.json(stat);
}

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Lazy import keeps the route usable even if sharp is missing at build time.
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.error('[admin/thumbnails] sharp not available', err);
    return NextResponse.json({ error: 'sharp module not available in runtime image' }, { status: 500 });
  }

  if (!fs.existsSync(CACHE_PATH)) {
    fs.mkdirSync(CACHE_PATH, { recursive: true });
  }

  const items = await prisma.item.findMany({
    where: { photoPath: { not: '' } },
    select: { id: true, photoPath: true, mainPhoto: true, evidNumber: true },
  });

  let generated = 0;
  let skipped = 0;
  let missing = 0;
  const errors: string[] = [];

  for (const item of items) {
    const mainName = `${String(item.mainPhoto).padStart(2, '0')}.jpg`;
    const sourcePath = path.resolve(path.join(PHOTOS_PATH, item.photoPath, mainName));
    const photosBase = path.resolve(PHOTOS_PATH);
    if (!sourcePath.startsWith(photosBase + path.sep)) continue;

    if (!fs.existsSync(sourcePath)) {
      missing++;
      continue;
    }

    for (const width of WARM_WIDTHS) {
      try {
        const sourceStat = fs.statSync(sourcePath);
        const key = crypto
          .createHash('sha1')
          .update(`${sourcePath}|${sourceStat.size}|${sourceStat.mtimeMs}|${width}`)
          .digest('hex');
        const cacheFile = path.join(CACHE_PATH, `${key}.webp`);

        if (fs.existsSync(cacheFile)) {
          skipped++;
          continue;
        }

        const buffer = await sharp(sourcePath)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const tmp = `${cacheFile}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, cacheFile);
        generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${item.evidNumber} @${width}: ${msg}`);
        if (errors.length > 20) break;
      }
    }
    if (errors.length > 20) break;
  }

  await logActivity(
    session.id,
    'admin.thumbnails.warm',
    '',
    `generated=${generated} skipped=${skipped} missing=${missing} errors=${errors.length}`
  );

  const stat = await collectStats();
  return NextResponse.json({
    ok: true,
    generated,
    skipped,
    missing,
    errors,
    ...stat,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(CACHE_PATH)) {
    return NextResponse.json({ ok: true, removed: 0 });
  }

  const files = fs.readdirSync(CACHE_PATH).filter((f) => f.endsWith('.webp'));
  let removed = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(CACHE_PATH, f));
      removed++;
    } catch {
      /* ignore */
    }
  }

  await logActivity(session.id, 'admin.thumbnails.clear', '', `removed=${removed}`);

  const stat = await collectStats();
  return NextResponse.json({ ok: true, removed, ...stat });
}

async function collectStats() {
  const totalItems = await prisma.item.count();
  const itemsWithPhotos = await prisma.item.count({ where: { photoPath: { not: '' } } });

  let cacheCount = 0;
  let cacheSizeBytes = 0;
  let sharpOk = false;
  try {
    await import('sharp');
    sharpOk = true;
  } catch {
    sharpOk = false;
  }

  if (fs.existsSync(CACHE_PATH)) {
    const files = fs.readdirSync(CACHE_PATH).filter((f) => f.endsWith('.webp'));
    cacheCount = files.length;
    for (const f of files) {
      try {
        cacheSizeBytes += fs.statSync(path.join(CACHE_PATH, f)).size;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    totalItems,
    itemsWithPhotos,
    cacheCount,
    cacheSizeMB: +(cacheSizeBytes / 1024 / 1024).toFixed(2),
    sharpAvailable: sharpOk,
    cachePath: CACHE_PATH,
  };
}
