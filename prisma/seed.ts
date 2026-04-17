import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(__dirname, '../../kameny/FOTO_MOLDAVITE');

async function main() {
  console.log('Seeding database...');
  console.log('Photos path:', PHOTOS_PATH);

  // Admin user: require explicit password via env var — no default.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@moldavite.cz';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD environment variable is required for seeding (min 12 chars).\n' +
      'Generate one: openssl rand -base64 18'
    );
  }
  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: { email: adminEmail, password: hashedPassword, name: 'Admin', role: 'ADMIN' },
    });
    console.log(`Created admin user: ${adminEmail} (password from ADMIN_PASSWORD env)`);
  } else {
    console.log(`Admin user already exists: ${adminEmail} (password not changed)`);
  }

  // Scan FOTO_MOLDAVITE directory
  if (!fs.existsSync(PHOTOS_PATH)) {
    console.log('Photos directory not found:', PHOTOS_PATH);
    return;
  }

  const boxDirs = fs.readdirSync(PHOTOS_PATH)
    .filter(d => d.startsWith('K'))
    .sort();

  for (const boxCode of boxDirs) {
    const boxPath = path.join(PHOTOS_PATH, boxCode);
    if (!fs.statSync(boxPath).isDirectory()) continue;

    // Create or find box
    const box = await prisma.box.upsert({
      where: { code: boxCode },
      update: {},
      create: { code: boxCode, name: `Krabice ${boxCode}` },
    });
    console.log(`Box: ${boxCode} (id: ${box.id})`);

    // Scan range folders (e.g. "0001-0005", "0001_0005")
    const rangeDirs = fs.readdirSync(boxPath)
      .filter(d => fs.statSync(path.join(boxPath, d)).isDirectory())
      .sort();

    for (const rangeDir of rangeDirs) {
      const rangePath = path.join(boxPath, rangeDir);

      // Scan individual stone folders
      const stoneDirs = fs.readdirSync(rangePath)
        .filter(d => fs.statSync(path.join(rangePath, d)).isDirectory())
        .sort();

      for (const stoneDir of stoneDirs) {
        const stonePath = path.join(rangePath, stoneDir);
        const evidNumber = stoneDir; // e.g. "0001"
        const photoRelPath = `${boxCode}/${rangeDir}/${stoneDir}`;

        // Check if stone has expected files
        const hasFlim = fs.existsSync(path.join(stonePath, 'flim.jpg'));
        if (!hasFlim) {
          console.log(`  Skipping ${evidNumber} - no flim.jpg`);
          continue;
        }

        await prisma.item.upsert({
          where: { boxId_evidNumber: { boxId: box.id, evidNumber } },
          update: { photoPath: photoRelPath, rangeFolder: rangeDir },
          create: {
            evidNumber,
            boxId: box.id,
            photoPath: photoRelPath,
            rangeFolder: rangeDir,
          },
        });
      }
    }

    const itemCount = await prisma.item.count({ where: { boxId: box.id } });
    console.log(`  -> ${itemCount} stones`);
  }

  const totalItems = await prisma.item.count();
  console.log(`\nDone! Total: ${boxDirs.length} boxes, ${totalItems} stones`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
