import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');
const PHOTOS_WEB_PATH = process.env.PHOTOS_WEB_PATH || '';
const WEB_MAX_WIDTH = 1920;
const WEB_QUALITY = 85;
const WEB_RESIZE_BUDGET_MS = 40_000; // stay below DSM reverse-proxy 60 s timeout

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(PHOTOS_PATH)) {
    return NextResponse.json(
      { error: 'Photos directory not found', path: PHOTOS_PATH },
      { status: 404 }
    );
  }

  let created = 0;
  let updated = 0;

  const boxDirs = fs.readdirSync(PHOTOS_PATH)
    .filter(d => d.startsWith('K') && fs.statSync(path.join(PHOTOS_PATH, d)).isDirectory())
    .sort();

  for (const boxCode of boxDirs) {
    const boxPath = path.join(PHOTOS_PATH, boxCode);

    const box = await prisma.box.upsert({
      where: { code: boxCode },
      update: {},
      create: { code: boxCode, name: `Kazeta ${boxCode}` },
    });

    const rangeDirs = fs.readdirSync(boxPath)
      .filter(d => fs.statSync(path.join(boxPath, d)).isDirectory())
      .sort();

    for (const rangeDir of rangeDirs) {
      const rangePath = path.join(boxPath, rangeDir);

      const stoneDirs = fs.readdirSync(rangePath)
        .filter(d => fs.statSync(path.join(rangePath, d)).isDirectory())
        .sort();

      for (const stoneDir of stoneDirs) {
        const stonePath = path.join(rangePath, stoneDir);
        const hasFlim = fs.existsSync(path.join(stonePath, 'flim.jpg'));
        if (!hasFlim) continue;

        const photoRelPath = `${boxCode}/${rangeDir}/${stoneDir}`;
        const existing = await prisma.item.findUnique({
          where: { boxId_evidNumber: { boxId: box.id, evidNumber: stoneDir } },
        });

        if (existing) {
          await prisma.item.update({
            where: { boxId_evidNumber: { boxId: box.id, evidNumber: stoneDir } },
            data: { photoPath: photoRelPath, rangeFolder: rangeDir },
          });
          updated++;
        } else {
          await prisma.item.create({
            data: {
              evidNumber: stoneDir,
              boxId: box.id,
              photoPath: photoRelPath,
              rangeFolder: rangeDir,
            },
          });
          created++;
        }
      }
    }
  }

  // After scanning DB records, eagerly generate web variants for any
  // originals that don't have one yet. Bounded by WEB_RESIZE_BUDGET_MS so
  // we still fit inside the reverse proxy timeout; the rest can be done
  // from /admin/thumbnails later (it's idempotent).
  const webStats = PHOTOS_WEB_PATH
    ? await generateMissingWebVariants()
    : { generated: 0, skipped: 0, failed: 0, remaining: 0 };

  await logActivity(
    session.id,
    'scan',
    '',
    `Scan: ${created} nových, ${updated} aktualizováno, web: ${webStats.generated} vytvořeno, ${webStats.remaining} zbývá`
  );
  return NextResponse.json({
    created,
    updated,
    total: created + updated,
    webGenerated: webStats.generated,
    webRemaining: webStats.remaining,
    webFailed: webStats.failed,
  });
}

async function generateMissingWebVariants() {
  const out = { generated: 0, skipped: 0, failed: 0, remaining: 0 };
  if (!PHOTOS_WEB_PATH) return out;

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return out;
  }

  if (!fs.existsSync(PHOTOS_WEB_PATH)) {
    fs.mkdirSync(PHOTOS_WEB_PATH, { recursive: true });
  }

  const start = Date.now();
  const stack: string[] = [PHOTOS_PATH];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const src = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(src);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') continue;

      const rel = path.relative(PHOTOS_PATH, src);
      const dst = path.join(PHOTOS_WEB_PATH, rel);

      if (Date.now() - start > WEB_RESIZE_BUDGET_MS) {
        out.remaining++;
        continue;
      }

      try {
        const srcStat = fs.statSync(src);
        const dstStat = fs.existsSync(dst) ? fs.statSync(dst) : null;
        if (dstStat && dstStat.mtimeMs >= srcStat.mtimeMs) {
          out.skipped++;
          continue;
        }
        const dstDir = path.dirname(dst);
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

        let pipeline = sharp(src).rotate().resize({ width: WEB_MAX_WIDTH, withoutEnlargement: true });
        if (ext === '.png') {
          pipeline = pipeline.png({ quality: WEB_QUALITY });
        } else {
          pipeline = pipeline.jpeg({ quality: WEB_QUALITY, mozjpeg: true });
        }
        const tmp = `${dst}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
        await pipeline.toFile(tmp);
        fs.renameSync(tmp, dst);
        out.generated++;
      } catch (err) {
        console.error('[scan→web-resize] failed for', rel, err);
        out.failed++;
      }
    }
  }

  return out;
}
