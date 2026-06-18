/**
 * Automatický výpočet kategorie velikosti kamene podle hmotnosti + poškození.
 *
 * Pravidla z Excel modelu:
 *   - 0.1–3.0 g                      → "Malé"
 *   - 3.1–9.9 g                      → "Střední"
 *   - ≥ 10 g s poškozením            → "Velké"  (= attrDamage != "Bez poškození" a non-empty)
 *   - ≥ 10 g bez poškození           → "Sbírkové"
 *
 * Funkce je pure — pro UI display, validaci, pricing rule.
 */
export type SizeCategory = 'Malé' | 'Střední' | 'Velké' | 'Sbírkové' | null;

export function computeSizeCategory(
  weightGrams: number | string | null | undefined,
  attrDamage: string | null | undefined
): SizeCategory {
  const w = weightGrams === null || weightGrams === undefined || weightGrams === ''
    ? NaN
    : Number(weightGrams);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w <= 3) return 'Malé';
  if (w < 10) return 'Střední';
  // ≥ 10 g — rozhodne poškození
  const damage = (attrDamage ?? '').trim();
  const undamaged = damage === '' || damage === 'Bez poškození';
  return undamaged ? 'Sbírkové' : 'Velké';
}

/** Barva chipu pro UI badge. */
export const SIZE_CATEGORY_COLOR: Record<NonNullable<SizeCategory>, string> = {
  'Malé': 'var(--muted-foreground)',
  'Střední': 'var(--info)',
  'Velké': 'var(--warning)',
  'Sbírkové': 'var(--primary)',
};
