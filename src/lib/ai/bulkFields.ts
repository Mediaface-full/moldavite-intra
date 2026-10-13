/**
 * Čistá logika hromadného generování: která textová pole kamene chybí a co z vygenerovaného
 * uložit. Bez `overwrite` se plní JEN prázdná pole — existující texty Gideona zůstávají.
 */
export const AI_TEXT_FIELDS = ['name', 'nameEn', 'description', 'descriptionEn', 'longDescription', 'longDescriptionEn'] as const;
export type AiTextField = (typeof AI_TEXT_FIELDS)[number];
export type TextFields = Record<AiTextField, string>;

/** Prázdné = nic po odstranění HTML tagů a bílých znaků (editor ukládá i „<p></p>"). */
export function isEmptyText(v: string | null | undefined): boolean {
  return !v || v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}

export function missingTextFields(current: Partial<Record<AiTextField, string | null>>): AiTextField[] {
  return AI_TEXT_FIELDS.filter((f) => isEmptyText(current[f]));
}

export function isMissingTexts(current: Partial<Record<AiTextField, string | null>>): boolean {
  return missingTextFields(current).length > 0;
}

/**
 * overwrite=false: jen pole, která jsou dnes prázdná a AI je vyplnila.
 * overwrite=true: všechna pole, která AI vyplnila (prázdný výstup AI nikdy nepřepíše existující text).
 */
export function pickFieldsToSave(
  current: Partial<Record<AiTextField, string | null>>,
  generated: TextFields,
  overwrite: boolean,
): Partial<TextFields> {
  const out: Partial<TextFields> = {};
  for (const f of AI_TEXT_FIELDS) {
    if (isEmptyText(generated[f])) continue;
    if (!overwrite && !isEmptyText(current[f])) continue;
    out[f] = generated[f];
  }
  return out;
}
