import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const PHOTOS_WEB_PATH = process.env.PHOTOS_WEB_PATH || '';

const MAX_WIDTH = 1920;
const QUALITY = 85;
const PROCESSABLE_EXTS = ['.jpg', '.jpeg', '.png'];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await collectStats());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!PHOTOS_WEB_PATH) {
    return NextResponse.json(
      { error: 'PHOTOS_WEB_PATH env not configured. Add the mount to docker-compose.' },
      { status: 500 }
    );
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.error('[web-resize] sharp not available', err);
    return NextResponse.json({ error: 'sharp module not available in runtime image' }, { status: 500 });
  }

  const { force = false } = (await request.json().catch(() => ({}))) as { force?: boolean };

  if (!fs.existsSync(PHOTOS_WEB_PATH)) {
    fs.mkdirSync(PHOTOS_WEB_PATH, { recursive: true });
  }

  const originals = walk(PHOTOS_PATH, PHOTOS_PATH).filter((rel) => {
    const ext = path.extname(rel).toLowerCase();
    return PROCESSABLE_EXTS.includes(ext);
  });

  // Time budget: return before DSM reverse proxy 60 s read timeout so the
  // client always gets a JSON response. Client re-calls until remaining=0.
  const BUDGET_MS = 50_000;
  const start = Date.now();

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let remaining = 0;
  const errors: string[] = [];

  for (let i = 0; i < originals.length; i++) {
    const rel = originals[i];

    if (Date.now() - start > BUDGET_MS) {
      // Everything from here onwards is still outstanding.
      remaining = originals.length - i;
      break;
    }

    const src = path.join(PHOTOS_PATH, rel);
    // Keep same extension as original (.jpg stays .jpg) so existing URLs match.
    const dst = path.join(PHOTOS_WEB_PATH, rel);
    const dstDir = path.dirname(dst);

    try {
      const srcStat = fs.statSync(src);
      const dstStat = fs.existsSync(dst) ? fs.statSync(dst) : null;
      if (!force && dstStat && dstStat.mtimeMs >= srcStat.mtimeMs) {
        skipped++;
        continue;
      }

      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

      const ext = path.extname(rel).toLowerCase();
      let pipeline = sharp(src).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
      if (ext === '.png') {
        pipeline = pipeline.png({ quality: QUALITY });
      } else {
        pipeline = pipeline.jpeg({ quality: QUALITY, mozjpeg: true });
      }

      const tmp = `${dst}.tmp-${process.pid}-${Date.now()}`;
      await pipeline.toFile(tmp);
      fs.renameSync(tmp, dst);
      created++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      if (errors.length < 20) errors.push(`${rel}: ${msg}`);
    }
  }

  await logActivity(
    session.id,
    'admin.web-resize',
    '',
    `created=${created} skipped=${skipped} failed=${failed} remaining=${remaining}`
  );

  const stats = await collectStats();
  return NextResponse.json({
    ok: true,
    created,
    skipped,
    failed,
    remaining,
    done: remaining === 0,
    totalOriginals: originals.length,
    errors,
    ...stats,
  });
}

async function collectStats() {
  const orig = countTree(PHOTOS_PATH);
  const web = PHOTOS_WEB_PATH ? countTree(PHOTOS_WEB_PATH) : { files: 0, bytes: 0 };
  let sharpOk = false;
  try {
    await import('sharp');
    sharpOk = true;
  } catch {
    sharpOk = false;
  }
  return {
    originalsCount: orig.files,
    originalsSizeMB: +(orig.bytes / 1024 / 1024).toFixed(1),
    webCount: web.files,
    webSizeMB: +(web.bytes / 1024 / 1024).toFixed(1),
    savedMB: +((orig.bytes - web.bytes) / 1024 / 1024).toFixed(1),
    sharpAvailable: sharpOk,
    webPath: PHOTOS_WEB_PATH || '(not configured)',
    maxWidth: MAX_WIDTH,
    quality: QUALITY,
  };
}

function countTree(root: string): { files: number; bytes: number } {
  if (!fs.existsSync(root)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (!PROCESSABLE_EXTS.includes(ext)) continue;
        try {
          const st = fs.statSync(full);
          files++;
          bytes += st.size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { files, bytes };
}

function walk(root: string, baseForRelative: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        out.push(path.relative(baseForRelative, full));
      }
    }
  }
  return out;
}
