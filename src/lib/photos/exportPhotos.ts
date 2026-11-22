/**
 * Fotky pro exporty (Upgates XML, CSV pro Etsy) — stejný výběr jako e-shop a Etsy API (Gideon 22. 11. 2026):
 * max 4 (ruční výběr, jinak čelo/¾/profil/záda), hlavní první, AI verze kde je použitelná a soubor existuje.
 * Vrací cesty pod /images (photoPath/…); .webp vyrobí /images on-demand, .jpg je pro Etsy (WebP nebere).
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveShopSlots } from './shopSelection';
import { isAiUsable, parseAiPhotos } from './aiPhotos';
import { availableSlots, itemDir } from './enhanceItem';

export function exportPhotoPaths(item: { photoPath: string; mainPhoto: number; shopPhotos: number[]; aiPhotos: unknown }, ext: 'webp' | 'jpg'): string[] {
  if (!item.photoPath) return [];
  const { slots } = resolveShopSlots(availableSlots(item.photoPath), item.mainPhoto, item.shopPhotos);
  const ai = parseAiPhotos(item.aiPhotos);
  const root = path.resolve(process.env.PHOTOS_PATH || path.join(process.cwd(), '..', 'kameny', 'FOTO_MOLDAVITE'));
  const dir = itemDir(root, item.photoPath);
  return slots.map((slot) => {
    const e = ai[String(slot)];
    if (dir && isAiUsable(e) && fs.existsSync(path.join(dir, 'ai', e.file))) {
      return `${item.photoPath}/ai/${ext === 'webp' ? e.file.replace(/\.jpg$/, '.webp') : e.file}`;
    }
    return `${item.photoPath}/${String(slot).padStart(2, '0')}.${ext}`;
  });
}
