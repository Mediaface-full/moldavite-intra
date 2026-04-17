import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');

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
      create: { code: boxCode, name: `Krabice ${boxCode}` },
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

  await logActivity(session.id, 'scan', '', `Scan: ${created} nových, ${updated} aktualizováno`);
  return NextResponse.json({ created, updated, total: created + updated });
}
