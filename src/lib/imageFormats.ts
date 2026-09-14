/**
 * Pomocné funkce pro formáty obrázků v /images route.
 *
 * On-demand WebP (14. 9. 2026): Upgates feed ukazuje na `…/01.webp`, ale na
 * disku jsou jen `01.jpg` originály (žádná hromadná konverze — rozhodnutí
 * Gideona „zatím to tak necháme"). Route při požadavku na `.webp`, který
 * neexistuje, zkusí zdrojový `.jpg` / `.jpeg` / `.png` se stejným jménem,
 * převede přes sharp (≤ 1920 px, q80) a výsledek kešuje jako thumbnaily.
 *
 * Etsy WebP nebere (ověřeno na help.etsy.com 14. 9. 2026: „.jpg, .gif, .png,
 * .svg, or .heic … the only image file types Etsy supports") — Etsy CSV
 * zůstává na `.jpg`.
 */

export const WEBP_SOURCE_EXTS = ['.jpg', '.jpeg', '.png'] as const;

/** Max šířka on-demand WebP (stejně jako web varianta JPEG z web-resize). */
export const WEBP_MAX_WIDTH = 1920;

export function isWebpRequest(segments: readonly string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  return /\.webp$/i.test(last);
}

/**
 * Pro `[..., '01.webp']` vrátí kandidáty `[..., '01.jpg']`, `[..., '01.jpeg']`,
 * `[..., '01.png']` (v tomto pořadí). Pro ne-webp požadavek vrátí [].
 * Segmenty se nijak nesanitizují — volající je už validoval.
 */
export function webpSourceCandidates(segments: readonly string[]): string[][] {
  if (!isWebpRequest(segments)) return [];
  const head = segments.slice(0, -1);
  const last = segments[segments.length - 1];
  const stem = last.replace(/\.webp$/i, '');
  return WEBP_SOURCE_EXTS.map((ext) => [...head, `${stem}${ext}`]);
}
