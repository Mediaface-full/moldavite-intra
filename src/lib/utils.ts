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

export function formatWeight(weight: number | string): string {
  const num = typeof weight === 'string' ? parseFloat(weight) : weight;
  return `${num.toFixed(2)} g`;
}

export function getCatalogNumber(boxCode: string, evidNumber: string): string {
  return `${boxCode}-${evidNumber}`;
}
