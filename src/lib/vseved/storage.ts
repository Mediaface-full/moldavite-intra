/**
 * Storage helpers pro Vseved uploady.
 *
 * Soubory ulozene jako /<UPLOAD_DIR>/<documentId>.<format>
 * - documentId je integer z DB (uz validovany)
 * - format whitelist 'txt' | 'epub'
 * - filename z user uploadu jen pro display title — neukladame ho jako filename
 *
 * UPLOAD_DIR konfigurovatelny pres env VSEVED_UPLOAD_DIR.
 * Default: process.cwd() + '/vseved-uploads' (relative k Next.js root).
 * V produkci nastavime na /volume1/docker/moldavite/vseved-uploads (bind mount).
 */
import { mkdir, unlink } from 'fs/promises';
import { resolve, sep } from 'path';

export function getUploadDir(): string {
  const configured = process.env.VSEVED_UPLOAD_DIR;
  if (configured && configured.trim()) return resolve(configured);
  return resolve(process.cwd(), 'vseved-uploads');
}

export function getDocumentPath(documentId: number, format: 'txt' | 'epub'): string {
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error(`Invalid documentId: ${documentId}`);
  }
  if (format !== 'txt' && format !== 'epub') {
    throw new Error(`Invalid format: ${format}`);
  }
  const dir = getUploadDir();
  const filePath = resolve(dir, `${documentId}.${format}`);
  // Defense-in-depth: ujisti se ze resolved path je uvnitr UPLOAD_DIR
  if (!filePath.startsWith(dir + sep)) {
    throw new Error('Path traversal detected');
  }
  return filePath;
}

export async function ensureUploadDir(): Promise<void> {
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
}

export async function deleteDocumentFile(documentId: number, format: 'txt' | 'epub'): Promise<void> {
  const filePath = getDocumentPath(documentId, format);
  try {
    await unlink(filePath);
  } catch (err) {
    // ENOENT = soubor uz neexistuje, OK
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
}

/**
 * Validuje user-supplied filename: alphanumeric + tecka + pomlcka + podtrzitko.
 * Pouziva se pro DISPLAY title pri uploadu, ne pro skutecny filename na disku.
 * Max 200 chars.
 */
/**
 * Název nahrávaného souboru se používá JEN jako popisek v DB (`sourceFile`); na disk se ukládá
 * `<id>.<format>`. Kontrola je tedy jen proti nesmyslům a traversal textu, ne proti FS.
 * 13. 10. 2026: původní `[A-Za-z0-9._\- ()]` odmítal diakritiku („Vltavíny a Tektity.txt" —
 * Gideon: „nesmysl") → povolena písmena všech abeced (\p{L}\p{M}), čísla, mezery, `._-()'&,`.
 */
export function isSafeFilename(filename: string): boolean {
  if (typeof filename !== 'string') return false;
  if (filename.length === 0 || filename.length > 200) return false;
  if (filename.includes('..') || /[/\\]/.test(filename)) return false;
  if (/[\x00-\x1f\x7f]/.test(filename)) return false;
  return /^[\p{L}\p{M}\p{N}._\- ()'&,]+$/u.test(filename);
}
