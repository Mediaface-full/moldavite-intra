/**
 * Které fotky kamene jdou do e-shopu (Gideon 21. 11. 2026: „max 4 fotky, z různých úhlů").
 *
 * Fotky kamene jsou 360° otočka: sloty 01–24 po 15° (01 a 13 = čelo a záda, 07 a 19 = profil).
 * Automatický výběr bere hlavní fotku a k ní pohledy posunuté o 45°, 90° a 180°:
 * čelo → třičtvrtě → profil → záda. Klasická sada produktových fotek, každá ukáže něco jiného.
 *
 * Když kámen nemá celou otočku (třeba 3 ručně nahrané fotky), bere se hlavní + další v pořadí.
 * Ruční výběr (`Item.shopPhotos`) má přednost; hlavní fotka je v e-shopu vždy první.
 */

export const SHOP_PHOTO_MAX = 4;
export const RING_SLOTS = 24;
/** Posuny od hlavní fotky v krocích po 15°: 0°, 45°, 90°, 180°. */
export const AUTO_OFFSETS = [0, 3, 6, 12] as const;
/** Od kolika fotek se sada bere jako otočka (jinak prostě pořadí). */
const MIN_RING = 8;

const ringDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % RING_SLOTS;
  return Math.min(d, RING_SLOTS - d);
};

/** Automatický výběr: hlavní + pohledy z co nejvíc různých úhlů. `available` = existující sloty 1–24. */
export function autoShopSlots(available: readonly number[], mainPhoto: number, max = SHOP_PHOTO_MAX): number[] {
  const slots = [...new Set(available)].filter((n) => Number.isInteger(n) && n >= 1 && n <= RING_SLOTS).sort((a, b) => a - b);
  if (!slots.length) return [];
  const main = slots.includes(mainPhoto) ? mainPhoto : slots[0];
  if (slots.length < MIN_RING) return [main, ...slots.filter((n) => n !== main)].slice(0, max);

  const picked: number[] = [];
  for (const off of AUTO_OFFSETS) {
    if (picked.length >= max) break;
    const target = ((main - 1 + off) % RING_SLOTS) + 1;
    let best: number | null = null;
    for (const n of slots) {
      if (picked.includes(n)) continue;
      if (best === null || ringDistance(n, target) < ringDistance(best, target)) best = n;
    }
    if (best !== null) picked.push(best);
  }
  return picked;
}

/** Validace ručního výběru z PATCH: celá čísla 1–24, bez duplicit, max 4. `null` = neplatné. */
export function parseShopPhotos(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > SHOP_PHOTO_MAX) return null;
  if (!value.every((n) => Number.isInteger(n) && n >= 1 && n <= RING_SLOTS)) return null;
  if (new Set(value).size !== value.length) return null;
  return value as number[];
}

/**
 * Finální sada pro e-shop: ruční výběr (jen existující sloty), jinak automatický.
 * Hlavní fotka vždy první; ruční výběr bez hlavní ji dostane na začátek a ořízne se na max.
 */
export function resolveShopSlots(available: readonly number[], mainPhoto: number, manual: readonly number[] | null | undefined): {
  slots: number[]; auto: boolean;
} {
  const exists = new Set(available);
  const chosen = (manual ?? []).filter((n) => exists.has(n));
  if (!chosen.length) return { slots: autoShopSlots(available, mainPhoto), auto: true };
  const main = exists.has(mainPhoto) ? mainPhoto : chosen[0];
  return { slots: [main, ...chosen.filter((n) => n !== main)].slice(0, SHOP_PHOTO_MAX), auto: false };
}
