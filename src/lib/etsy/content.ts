/**
 * Obsah a cena Etsy listingu — čisté funkce (bez DB). Texty anglicky (Etsy obchod je EN).
 * Cena = applyShopModifier(finální cena kamene, ExportConfig 'etsy') → kurz ČNB do měny obchodu,
 * celé jednotky. Otisk obsahu rozhoduje, jestli se listing na Etsy aktualizuje.
 */
import { createHash } from 'crypto';
import { applyShopModifier, type ShopModifierConfig } from '@/lib/pricing/shopModifier';
import { toDecimal } from '@/lib/pricing/decimal';
import { getPasShape } from '@/lib/pasShapes';
import { formatWeight } from '@/lib/utils';

/** Výchozí štítky — stejné jako dosavadní CSV export pro Etsy. */
export const DEFAULT_ETSY_TAGS = ['moldavite', 'czech moldavite', 'tektite', 'natural moldavite', 'genuine moldavite', 'raw moldavite', 'green tektite', 'bohemian moldavite'];
export const DEFAULT_ETSY_MATERIALS = ['moldavite', 'tektite'];
const TITLE_MAX = 140;

export interface EtsyContentSource {
  catalogNumber: string;
  nameEn: string;
  descriptionEn: string;
  longDescriptionEn: string;
  weight: string | number;
  pasShape: string;
}

export function etsyTitle(item: EtsyContentSource): string {
  const raw = item.nameEn.trim() || `Natural Czech Moldavite ${item.catalogNumber} - ${formatWeight(item.weight)}`;
  const clean = raw.replace(/[^\p{L}\p{N} \-'.,:&/()]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= TITLE_MAX) return clean;
  const cut = clean.slice(0, TITLE_MAX + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).trim();
}

export function etsyDescription(item: EtsyContentSource, verifyBaseUrl: string): string {
  const shape = getPasShape(item.pasShape);
  const parts = [
    shape ? `Shape: ${shape.en}` : '',
    item.longDescriptionEn.trim() || item.descriptionEn.trim() || 'Genuine natural moldavite from the Czech Republic.',
    `Weight: ${formatWeight(item.weight)}`,
    `Catalogue number: ${item.catalogNumber}`,
    `Each stone comes with a certificate of authenticity that can be verified online at ${verifyBaseUrl.replace(/\/+$/, '')}.`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

export function etsyTags(settingsTags: string[], pasShape: string): string[] {
  const base = settingsTags.length ? settingsTags : DEFAULT_ETSY_TAGS;
  const shape = getPasShape(pasShape);
  const all = [...base, ...(shape ? [shape.en.split('/')[0]] : pasShape ? [pasShape] : [])];
  const out: string[] = [];
  for (const t of all) {
    const tag = t.trim().toLowerCase();
    if (!tag || tag.length > 20 || out.includes(tag)) continue;
    out.push(tag);
    if (out.length === 13) break;
  }
  return out;
}

export function etsyPrice(finalCzk: string, cfg: ShopModifierConfig, currency: string, rates: Record<string, number>): number | null {
  const base = toDecimal(finalCzk || '0');
  if (base.lte(0)) return null;
  const czk = applyShopModifier(base, cfg).toNumber();
  if (currency === 'CZK') return Math.round(czk);
  const rate = rates[currency];
  if (!rate || rate <= 0) return null;
  return Math.round(czk / rate);
}

export function etsyContentHash(parts: {
  title: string; description: string; tags: string[]; materials: string[]; price: number; photoFiles: string[]; settingsVersion: string;
}): string {
  const ordered = Object.fromEntries(Object.keys(parts).sort().map((k) => [k, parts[k as keyof typeof parts]]));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0, 16);
}
