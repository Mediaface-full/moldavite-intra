#!/usr/bin/env node
/**
 * Import knih z filesystem do DB (bulk workaround pro HTTP upload limit).
 *
 * Použití:
 *   1. FTP / File Station: nahraj PDF/EPUB do /volume1/docker/moldavite/library/
 *   2. Spusť: docker exec moldavite_app node scripts/import-library-fs.mjs [categoryId] [--dry]
 *      - categoryId: optional integer — přiřadí všem nově importovaným knihám
 *      - --dry: nic nezapisuje, jen ukáže co by udělal
 *
 * Co dělá:
 * - Scanuje LIBRARY_PATH (default /data/library) na PDF / EPUB / MOBI
 * - Přeskočí soubory co už mají UUID format (= uploaded přes UI)
 * - Přejmenuje ostatní na `<uuid>.<ext>` (aby matchlo storage pattern)
 * - Vytvoří DB záznam s title = original filename bez přípony
 * - uploadedById = první ADMIN user v DB
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const LIBRARY_ROOT = process.env.LIBRARY_PATH || '/data/library';

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const categoryIdArg = args.find((a) => a !== '--dry' && /^\d+$/.test(a));
const categoryId = categoryIdArg ? parseInt(categoryIdArg, 10) : null;

const prisma = new PrismaClient();

async function main() {
  console.log(`\n==> Import z ${LIBRARY_ROOT} ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`    Kategorie: ${categoryId ?? '(žádná)'}\n`);

  try {
    await fs.access(LIBRARY_ROOT);
  } catch {
    console.error(`✗ Adresář neexistuje: ${LIBRARY_ROOT}`);
    console.error(`  Vytvoř přes: mkdir -p ${LIBRARY_ROOT} && chmod 777 ${LIBRARY_ROOT}`);
    process.exitCode = 1;
    return;
  }

  // Ověř kategorie
  if (categoryId !== null) {
    const cat = await prisma.bookCategory.findUnique({ where: { id: categoryId } });
    if (!cat) {
      console.error(`✗ Kategorie id=${categoryId} neexistuje. Založ ji v /admin/library-kategorie nebo použij bez argumentu.`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ Kategorie: „${cat.name}"`);
  }

  // Najdi admin usera (pro uploadedById)
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
  if (!admin) {
    console.error('✗ Žádný ADMIN user v DB — nelze přiřadit uploadedById.');
    process.exitCode = 1;
    return;
  }

  // List souborů + filtrování
  const entries = await fs.readdir(LIBRARY_ROOT);
  const importable = [];
  const skipped = [];

  for (const filename of entries) {
    if (UUID_PATTERN.test(filename)) {
      skipped.push({ filename, reason: 'UUID format (už v DB)' });
      continue;
    }
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      skipped.push({ filename, reason: `nepodporovaná přípona .${ext}` });
      continue;
    }
    const full = path.join(LIBRARY_ROOT, filename);
    const stat = await fs.stat(full);
    if (!stat.isFile()) {
      skipped.push({ filename, reason: 'není soubor' });
      continue;
    }
    importable.push({ filename, mimeType, ext, size: stat.size });
  }

  console.log(`\nNalezeno ${importable.length} k importu, ${skipped.length} přeskočeno.`);
  if (skipped.length > 0) {
    console.log('\nPřeskočené:');
    for (const s of skipped) console.log(`  - ${s.filename} (${s.reason})`);
  }
  if (importable.length === 0) {
    console.log('\nNic k importu.');
    return;
  }

  console.log('\nK importu:');
  for (const f of importable) {
    console.log(`  + ${f.filename} (${f.mimeType}, ${(f.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  if (dryRun) {
    console.log('\n(DRY RUN — nic se nezapsalo. Bez --dry proběhne skutečný import.)');
    return;
  }

  console.log(`\nImportuji ${importable.length} souborů…\n`);
  let ok = 0;
  let failed = 0;

  for (const f of importable) {
    try {
      const storageFilename = `${randomUUID()}.${f.ext}`;
      const oldPath = path.join(LIBRARY_ROOT, f.filename);
      const newPath = path.join(LIBRARY_ROOT, storageFilename);
      await fs.rename(oldPath, newPath);

      const title = f.filename.replace(/\.[^.]+$/, '').trim() || f.filename;
      const book = await prisma.book.create({
        data: {
          title,
          filename: f.filename,
          storageFilename,
          mimeType: f.mimeType,
          size: f.size,
          categoryId,
          uploadedById: admin.id,
        },
      });
      console.log(`  ✓ ${title} → id=${book.id}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${f.filename}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✓ Hotovo: ${ok} importováno, ${failed} selhalo`);
}

main()
  .catch((err) => { console.error('✗ Import selhal:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
