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
  return fs.readFile(storagePath(storageFilename));
}
