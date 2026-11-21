/** E-shopové fotky kamene a kolik z nich ještě nemá AI úpravu (tlačítko „AI fotky · chybí N“). Čte disk. */
import { resolveShopSlots } from './shopSelection';
import { parseAiPhotos } from './aiPhotos';
import { availableSlots } from './enhanceItem';

type Src = { photoPath: string; mainPhoto: number; shopPhotos: number[]; aiPhotos: unknown };

export function shopPhotoStats(item: Src): { available: number[]; slots: number[]; auto: boolean; missing: number[] } {
  if (!item.photoPath) return { available: [], slots: [], auto: true, missing: [] };
  const available = availableSlots(item.photoPath);
  const { slots, auto } = resolveShopSlots(available, item.mainPhoto, item.shopPhotos);
  const ai = parseAiPhotos(item.aiPhotos);
  return { available, slots, auto, missing: slots.filter((s) => !ai[String(s)] || ai[String(s)].status === 'rejected') };
}

export const missingAiSlots = (item: Src): number[] => shopPhotoStats(item).missing;
