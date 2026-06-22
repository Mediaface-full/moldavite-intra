import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getPhotoUrl(photoPath: string, filename: string): string {
  return `/images/${photoPath}/${filename}`;
}

// width must match one of ALLOWED_THUMB_WIDTHS in /api/images. 192 is a good
// default for ~44px UI thumbs on retina screens.
export function getThumbnailUrl(photoPath: string, mainPhoto: number = 1, width: number = 192): string {
  return `${getPhotoUrl(photoPath, `${String(mainPhoto).padStart(2, '0')}.jpg`)}?w=${width}`;
}

export function get360Photos(photoPath: string): string[] {
  return Array.from({ length: 24 }, (_, i) =>
    getPhotoUrl(photoPath, `${String(i + 1).padStart(2, '0')}.jpg`)
  );
}

export function getVideoUrl(photoPath: string): string {
  return getPhotoUrl(photoPath, 'video.mp4');
}

export function getGifUrl(photoPath: string): string {
  return getPhotoUrl(photoPath, 'export.gif');
}

export function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
  }).format(num);
}

/**
 * Globální formátování hmotnosti pro UI — VŽDY 2 desetinná místa.
 * Per Gideon (22. 6. 2026): kameny, kazety, zakázky se počítají v gramech na 2 desetiny.
 *
 * Pro nulové / neplatné hodnoty vrací „—" (em-dash) — neukazujem „0.00 g" jako placeholder.
 * Pro místa kde 0 znamená „prázdno explicitně" použij formatWeightStrict.
 *
 * Options:
 *   unit: 'g' (default, suffix „ g") | 'none' (jen číslo — pro tabulky s „(G)" v hlavičce)
 */
type WeightUnitOption = 'g' | 'none';
export function formatWeight(
  weight: number | string | null | undefined,
  options: { unit?: WeightUnitOption } = {},
): string {
  if (weight === null || weight === undefined || weight === '') return '—';
  const num = typeof weight === 'string' ? parseFloat(weight) : weight;
  if (!Number.isFinite(num) || num === 0) return '—';
  return options.unit === 'none' ? num.toFixed(2) : `${num.toFixed(2)} g`;
}

/**
 * Vždy číselný output — pro místa kde 0 znamená „explicitně nic" (součty),
 * ne „nezadáno". „0.00 g" zobrazí, ne „—".
 */
export function formatWeightStrict(
  weight: number | string | null | undefined,
  options: { unit?: WeightUnitOption } = {},
): string {
  if (weight === null || weight === undefined || weight === '') return options.unit === 'none' ? '0.00' : '0.00 g';
  const num = typeof weight === 'string' ? parseFloat(weight) : weight;
  if (!Number.isFinite(num)) return options.unit === 'none' ? '0.00' : '0.00 g';
  return options.unit === 'none' ? num.toFixed(2) : `${num.toFixed(2)} g`;
}

export function getCatalogNumber(boxCode: string, evidNumber: string): string {
  return `${boxCode}-${evidNumber}`;
}
