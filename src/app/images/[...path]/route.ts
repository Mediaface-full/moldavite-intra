import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const CACHE_PATH = process.env.THUMB_CACHE_PATH || path.join(PHOTOS_PATH, '..', '.photos-cache');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const THUMBNAILABLE = new Set(['.jpg', '.jpeg', '.png']);
const ALLOWED_THUMB_WIDTHS = [64, 128, 192, 256, 384, 512];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Reject path segments containing traversal or NUL bytes early.
  for (const seg of segments) {
    if (seg.includes('..') || seg.includes('\0') || seg.includes('/') || seg.includes('\\')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const filePath = path.join(PHOTOS_PATH, ...segments);
  const resolvedBase = path.resolve(PHOTOS_PATH);
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Follow symlinks and re-verify the real path is still under PHOTOS_PATH.
  let realPath: string;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const realBase = fs.realpathSync(resolvedBase);
  if (realPath !== realBase && !realPath.startsWith(realBase + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ext = path.extname(realPath).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ---------- Thumbnail variant ----------
  const searchParams = new URL(request.url).searchParams;
  const wRaw = searchParams.get('w');
  if (wRaw && THUMBNAILABLE.has(ext)) {
    const w = Number.parseInt(wRaw, 10);
    if (ALLOWED_THUMB_WIDTHS.includes(w)) {
      const thumb = await getOrBuildThumbnail(realPath, w);
      if (thumb) {
        return new NextResponse(new Uint8Array(thumb), {
          headers: {
            'Content-Type': 'image/webp',
            'Content-Length': String(thumb.length),
            'Cache-Control': 'public, max-age=604800, immutable',
          },
        });
      }
    }
  }

  const stat = fs.statSync(realPath);

  // Handle range requests for video
  const range = request.headers.get('range');
  if (range && contentType.startsWith('video/')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(realPath, { start, end });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(new Uint8Array(buffer), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      },
    });
  }

  const buffer = fs.readFileSync(realPath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

// Generate a WebP thumbnail at the requested width, cache it on disk, and
// return the bytes. Returns null if sharp cannot be loaded or resize fails —
// caller should fall through to the full image in that case.
async function getOrBuildThumbnail(sourcePath: string, width: number): Promise<Buffer | null> {
  try {
    const sourceStat = fs.statSync(sourcePath);
    const key = crypto
      .createHash('sha1')
      .update(`${sourcePath}|${sourceStat.size}|${sourceStat.mtimeMs}|${width}`)
      .digest('hex');
    const cacheFile = path.join(CACHE_PATH, `${key}.webp`);

    if (fs.existsSync(cacheFile)) {
      return fs.readFileSync(cacheFile);
    }

    // Lazy import so the route still serves full images even if sharp is
    // unavailable (e.g. missing native binding on an unexpected platform).
    const sharp = (await import('sharp')).default;

    if (!fs.existsSync(CACHE_PATH)) {
      fs.mkdirSync(CACHE_PATH, { recursive: true });
    }

    const buffer = await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // Atomic write to avoid half-written cache files on crash.
    const tmp = `${cacheFile}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, cacheFile);

    return buffer;
  } catch (err) {
    console.error('[images] thumbnail generation failed', err);
    return null;
  }
}
