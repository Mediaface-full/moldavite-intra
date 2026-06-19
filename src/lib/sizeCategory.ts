/**
 * Automatický výpočet kategorie velikosti kamene POUZE podle hmotnosti.
 *
 * Pravidla (upravená 19. 6. 2026 — poškození je samostatný atribut,
 * nevazaný na sizeCategory; Sbírkový je samostatný boolean checkbox):
 *
 *   - 0.1–3.0 g     → "Malé"
 *   - 3.1–9.9 g     → "Střední"
 *   - ≥ 10 g        → "Velké"
 *
 * Funkce je pure — pro UI display badge v detailu kamene.
 */
export type SizeCategory = 'Malé' | 'Střední' | 'Velké' | null;

export function computeSizeCategory(
  weightGrams: number | string | null | undefined
): SizeCategory {
  const w = weightGrams === null || weightGrams === undefined || weightGrams === ''
    ? NaN
    : Number(weightGrams);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w <= 3) return 'Malé';
  if (w < 10) return 'Střední';
  return 'Velké';
}

/** Barva chipu pro UI badge. */
export const SIZE_CATEGORY_COLOR: Record<NonNullable<SizeCategory>, string> = {
  'Malé': 'var(--muted-foreground)',
  'Střední': 'var(--info)',
  'Velké': 'var(--warning)',
};
