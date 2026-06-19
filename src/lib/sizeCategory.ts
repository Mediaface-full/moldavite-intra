/**
 * Automatický výpočet kategorie velikosti kamene podle hmotnosti + poškození.
 *
 * Pravidla (upravená pro Gideona 19. 6. 2026 — poškození ovlivňuje vždy,
 * ne jen u ≥10g jak bylo původně v Excel modelu kolegy):
 *
 *   - Bez poškození (jakákoliv váha) → "Sbírkové"
 *   - 0.1–3.0 g s poškozením         → "Malé"
 *   - 3.1–9.9 g s poškozením         → "Střední"
 *   - ≥ 10 g s poškozením            → "Velké"
 *
 * „Bez poškození" znamená attrDamage === "Bez poškození" nebo nevyplněno.
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
  const damage = (attrDamage ?? '').trim();
  const undamaged = damage === '' || damage === 'Bez poškození';
  // Bez poškození → Sbírkové (jakákoliv váha)
  if (undamaged) return 'Sbírkové';
  // S poškozením → kategorie podle váhy
  if (w <= 3) return 'Malé';
  if (w < 10) return 'Střední';
  return 'Velké';
}

/** Barva chipu pro UI badge. */
export const SIZE_CATEGORY_COLOR: Record<NonNullable<SizeCategory>, string> = {
  'Malé': 'var(--muted-foreground)',
  'Střední': 'var(--info)',
  'Velké': 'var(--warning)',
  'Sbírkové': 'var(--primary)',
};
