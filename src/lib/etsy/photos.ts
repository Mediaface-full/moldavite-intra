/**
 * Fotky pro Etsy = stejné jako pro e-shop (max 4, hlavní první, AI verze kde je použitelná), ale jako JPG
 * (Etsy WebP nebere). `file` je absolutní cesta na disku; AI verze jen když soubor opravdu existuje.
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { resolveShopSlots } from '@/lib/photos/shopSelection';
import { isAiUsable, parseAiPhotos } from '@/lib/photos/aiPhotos';
import { availableSlots, findSource, itemDir } from '@/lib/photos/enhanceItem';

export interface EtsyPhotoEntry { slot: number; file: string; ai: boolean }
const MAX_PX = 3000;

export function etsyPhotoPlan(item: { photoPath: string; mainPhoto: number; shopPhotos: number[]; aiPhotos: unknown }): EtsyPhotoEntry[] {
  if (!item.photoPath) return [];
  const { slots } = resolveShopSlots(availableSlots(item.photoPath), item.mainPhoto, item.shopPhotos);
  const ai = parseAiPhotos(item.aiPhotos);
  const root = path.resolve(process.env.PHOTOS_PATH || path.join(process.cwd(), '..', 'kameny', 'FOTO_MOLDAVITE'));
  const dir = itemDir(root, item.photoPath);
  const out: EtsyPhotoEntry[] = [];
  for (const slot of slots) {
    const e = ai[String(slot)];
    const aiFile = dir && isAiUsable(e) ? path.join(dir, 'ai', e.file) : null;
    if (aiFile && fs.existsSync(aiFile)) { out.push({ slot, file: aiFile, ai: true }); continue; }
    const src = findSource(item.photoPath, slot);
    if (src) out.push({ slot, file: src, ai: false });
  }
  return out;
}

export async function etsyPhotoJpeg(entry: EtsyPhotoEntry): Promise<Buffer> {
  return sharp(entry.file).rotate()
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
