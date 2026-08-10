/**
 * Cover thumbnails pro knihy — generuje JPG náhled z první stránky PDF přes
 * `pdftoppm` (poppler-utils, nainstalované v Dockerfile runner stage).
 *
 * Storage: `<LIBRARY_ROOT>/covers/<bookId>.jpg` (bind mount `./library` v compose).
 * Endpoint `/api/library/books/[id]/cover` servne JPG, 404 pokud chybí.
 *
 * EPUB/MOBI cover extraction není v MVP — vrací se placeholder ikona v UI.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LIBRARY_ROOT, storagePath } from './storage';

const COVERS_DIR = path.join(LIBRARY_ROOT, 'covers');

export function coverPath(bookId: number): string {
  if (!Number.isInteger(bookId) || bookId <= 0) throw new Error('Invalid bookId');
  return path.join(COVERS_DIR, `${bookId}.jpg`);
}

export async function ensureCoversDir(): Promise<void> {
  await fs.mkdir(COVERS_DIR, { recursive: true });
}

export async function hasCover(bookId: number): Promise<boolean> {
  try {
    const stat = await fs.stat(coverPath(bookId));
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export async function readCover(bookId: number): Promise<Buffer> {
  return fs.readFile(coverPath(bookId));
}

export async function deleteCover(bookId: number): Promise<void> {
  try {
    await fs.unlink(coverPath(bookId));
  } catch {
    // soubor neexistuje — ignore
  }
}

/**
 * Vygeneruje cover pro PDF přes pdftoppm.
 *
 * @param bookId       ID knihy v DB
 * @param storageFile  storageFilename (uuid.pdf) — resolvuje se přes storagePath
 * @param mimeType     když není 'application/pdf', vrací false (EPUB/MOBI zatím ne)
 * @returns true = cover vytvořen, false = skip / selhalo (loguje důvod)
 */
export async function generateCover(
  bookId: number,
  storageFile: string,
  mimeType: string,
): Promise<boolean> {
  if (mimeType !== 'application/pdf') return false;

  await ensureCoversDir();

  const pdfPath = storagePath(storageFile);
  try {
    await fs.access(pdfPath);
  } catch {
    console.error(`[cover] source PDF chybí: ${pdfPath}`);
    return false;
  }

  const outPath = coverPath(bookId);
  const prefix = outPath.replace(/\.jpg$/, '');

  // pdftoppm -jpeg -f 1 -l 1 -scale-to 600 input.pdf output-prefix
  //   -f 1 -l 1     první stránka only
  //   -scale-to 600 max delší strana 600px (rychlé, malý soubor)
  //   -jpeg         JPEG output (default je PPM)
  //   -jpegopt quality=80 rozumná komprese
  return new Promise<boolean>((resolve) => {
    const proc = spawn('pdftoppm', [
      '-jpeg',
      '-jpegopt', 'quality=80',
      '-f', '1',
      '-l', '1',
      '-scale-to', '600',
      pdfPath,
      prefix,
    ], { timeout: 30_000 });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      console.error(`[cover] pdftoppm spawn error (book ${bookId}):`, err.message);
      resolve(false);
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[cover] pdftoppm exit ${code} (book ${bookId}): ${stderr.trim().slice(0, 200)}`);
        resolve(false);
        return;
      }
      // pdftoppm produkuje suffix -1 (nebo -01 když stránek >= 10) — resp. u single-page varianty s -f 1 -l 1
      // vygeneruje `prefix-1.jpg` nebo `prefix-01.jpg` podle celkového počtu stránek dokumentu.
      // Přejmenujeme na prefix.jpg (co endpoint očekává).
      const candidates = [`${prefix}-1.jpg`, `${prefix}-01.jpg`, `${prefix}-001.jpg`];
      for (const c of candidates) {
        try {
          await fs.rename(c, outPath);
          resolve(true);
          return;
        } catch {
          // continue
        }
      }
      console.error(`[cover] pdftoppm ran but no output file found for book ${bookId} (tried ${candidates.join(', ')})`);
      resolve(false);
    });
  });
}

/**
 * Fire-and-forget wrapper — použij v POST/import handlerech aby generování coveru
 * nezablokovalo response. Chyby jen logujeme.
 */
export function generateCoverAsync(bookId: number, storageFile: string, mimeType: string): void {
  generateCover(bookId, storageFile, mimeType).catch((err) => {
    console.error(`[cover] async generate failed (book ${bookId}):`, err);
  });
}
