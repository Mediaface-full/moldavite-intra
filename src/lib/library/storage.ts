/**
 * Knihovna: filesystem storage utility.
 *
 * Soubory jsou na disku pod LIBRARY_PATH (bind mount na NASu, default lokálně).
 * Pojmenované jako `<uuid>.<ext>` aby original filename mohl obsahovat cokoli
 * (diakritika, mezery, / ...) bez rizika path traversal.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const LIBRARY_ROOT =
  process.env.LIBRARY_PATH || path.join(process.cwd(), 'library-storage');

/** MIME → přípona (podporované formáty). */
export const SUPPORTED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/x-mobipocket-ebook': 'mobi',
};

export function extensionForMime(mime: string): string | null {
  return SUPPORTED_MIME[mime] ?? null;
}

/**
 * MIME podle magic bytes (audit 10. 9. 2026) — `file.type` z multipart formu
 * si klient volí sám. Nikdy nespoléhat na něj: obsah rozhoduje.
 *   PDF  : "%PDF-" na offsetu 0
 *   EPUB : ZIP signature "PK\x03\x04" na offsetu 0
 *   MOBI : "BOOKMOBI" na offsetu 60 (PalmDOC header)
 */
export function sniffBookMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return 'application/epub+zip';
  }
  if (buf.length >= 68 && buf.toString('latin1', 60, 68) === 'BOOKMOBI') return 'application/x-mobipocket-ebook';
  return null;
}

export async function ensureLibraryDir(): Promise<void> {
  await fs.mkdir(LIBRARY_ROOT, { recursive: true });
}

/** Vygeneruje unikátní storage filename podle přípony. */
export function newStorageFilename(ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  return `${randomUUID()}.${safeExt}`;
}

export function storagePath(storageFilename: string): string {
  // Basic safety — storageFilename je z DB, ale pro jistotu zákaz slashe
  if (storageFilename.includes('/') || storageFilename.includes('\\')) {
    throw new Error('Invalid storageFilename');
  }
  return path.join(LIBRARY_ROOT, storageFilename);
}

export async function writeBookFile(storageFilename: string, buffer: Buffer): Promise<void> {
  await ensureLibraryDir();
  await fs.writeFile(storagePath(storageFilename), buffer);
}

export async function deleteBookFile(storageFilename: string): Promise<void> {
  try {
    await fs.unlink(storagePath(storageFilename));
  } catch {
    // Soubor už chybí — ignore (metadata mazání pokračuje).
  }
}

export async function readBookFile(storageFilename: string): Promise<Buffer> {
  // realpath check: soubor (nebo symlink na něj) musí ležet pod LIBRARY_ROOT.
  const [real, rootReal] = await Promise.all([
    fs.realpath(storagePath(storageFilename)),
    fs.realpath(LIBRARY_ROOT),
  ]);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    throw new Error('Book path escapes library root');
  }
  return fs.readFile(real);
}
