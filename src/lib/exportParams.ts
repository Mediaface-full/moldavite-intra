/**
 * Parametry kamene pro e-shop feed (Upgates / WooCommerce import).
 *
 * Spec: docs/ESHOP-PARAMETRY.md. Rozhodnutí Gideona 14. 9. 2026:
 *  - do feedu jde vše z §2 KROMĚ certifikátu,
 *  - OBĚ jazykové sady najednou (CZ i EN parametr vedle sebe), aby si
 *    importér (WooCommerce) vzal všechna data jedním načtením,
 *  - hmotnostní rozsahy: do 3 g / 3–5 g / 5–10 g / 10–20 g / nad 20 g.
 *
 * Pure funkce — žádná DB, žádný XML. Route si načte číselník AttrOption
 * jednou a předá ho jako `AttrDict`. Prázdné hodnoty → parametr se
 * negeneruje; výjimka `Sbírkový kus` (Ano/Ne vždy, jinak filtr „jen
 * sbírkové" nemá proti čemu stát).
 */
import { computeSizeCategory, type SizeCategory } from './sizeCategory';
import { getPasShape } from './pasShapes';

export type FeedParam = { name: string; value: string };

/** klíč `${attrKey}:${value}` → labely z číselníku AttrOption */
export type AttrDict = Record<string, { label: string | null; labelEn: string | null }>;

export interface ParamItem {
  weight: unknown;          // Prisma Decimal | number | string
  weightCt?: unknown;
  location: string;
  pasShape: string;
  attrColor: string[];
  attrDamage: string;
  attrCollectible: boolean;
  salePrice?: unknown;
  priceEUR?: unknown;
  priceUSD?: unknown;
}

export function attrDictKey(attrKey: string, value: string): string {
  return `${attrKey}:${value}`;
}

function labelCz(dict: AttrDict, attrKey: string, value: string): string {
  const e = dict[attrDictKey(attrKey, value)];
  return (e?.label && e.label.trim()) || value;
}

function labelEn(dict: AttrDict, attrKey: string, value: string): string {
  const e = dict[attrDictKey(attrKey, value)];
  return (e?.labelEn && e.labelEn.trim()) || (e?.label && e.label.trim()) || value;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : NaN;
}

const SIZE_EN: Record<NonNullable<SizeCategory>, string> = {
  'Malé': 'Small',
  'Střední': 'Medium',
  'Velké': 'Large',
};

/** Hmotnostní rozsah (§2 P7). Horní hranice exkluzivní kromě první (≤ 3 g = Malé). */
export function weightRange(w: number): { cz: string; en: string } | null {
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w <= 3) return { cz: 'do 3 g', en: 'up to 3 g' };
  if (w < 5) return { cz: '3–5 g', en: '3–5 g' };
  if (w < 10) return { cz: '5–10 g', en: '5–10 g' };
  if (w < 20) return { cz: '10–20 g', en: '10–20 g' };
  return { cz: 'nad 20 g', en: 'over 20 g' };
}

export function buildItemParams(item: ParamItem, dict: AttrDict): FeedParam[] {
  const out: FeedParam[] = [];
  const push = (name: string, value: string) => { if (value && value.trim()) out.push({ name, value: value.trim() }); };

  // Lokalita / Location
  if (item.location) {
    push('Lokalita', labelCz(dict, 'location', item.location));
    push('Location', labelEn(dict, 'location', item.location));
  }

  // Tvar / Shape — PAS_SHAPES má vlastní cz/en, jinak číselník
  if (item.pasShape) {
    const shape = getPasShape(item.pasShape);
    push('Tvar', shape ? shape.cz : labelCz(dict, 'pasShape', item.pasShape));
    push('Shape', shape ? shape.en : labelEn(dict, 'pasShape', item.pasShape));
  }

  // Hmotnost → Velikost, rozsah, gramy, karáty
  const w = num(item.weight);
  if (Number.isFinite(w) && w > 0) {
    const size = computeSizeCategory(w);
    if (size) {
      push('Velikost', size);
      push('Size', SIZE_EN[size]);
    }
    const range = weightRange(w);
    if (range) {
      push('Hmotnostní kategorie', range.cz);
      push('Weight range', range.en);
    }
    push('Hmotnost', `${w.toFixed(2)} g`);
    push('Weight', `${w.toFixed(2)} g`);
    const ctRaw = num(item.weightCt);
    const ct = Number.isFinite(ctRaw) && ctRaw > 0 ? ctRaw : w * 5;
    push('Hmotnost (ct)', `${ct.toFixed(2)} ct`);
    push('Weight (ct)', `${ct.toFixed(2)} ct`);
  }

  // Barva / Color — každá hodnota samostatný PARAM
  for (const c of item.attrColor ?? []) {
    if (!c) continue;
    push('Barva', labelCz(dict, 'attrColor', c));
    push('Color', labelEn(dict, 'attrColor', c));
  }

  // Stav / Condition
  if (item.attrDamage) {
    push('Stav', labelCz(dict, 'attrDamage', item.attrDamage));
    push('Condition', labelEn(dict, 'attrDamage', item.attrDamage));
  }

  // Sbírkový kus — vždy
  push('Sbírkový kus', item.attrCollectible ? 'Ano' : 'Ne');
  push("Collector's piece", item.attrCollectible ? 'Yes' : 'No');

  // Ceny (informativní, jako dosud)
  const czk = num(item.salePrice);
  const eur = num(item.priceEUR);
  const usd = num(item.priceUSD);
  if (czk > 0) push('Cena CZK', `${czk} CZK`);
  if (eur > 0) push('Cena EUR', `${eur} EUR`);
  if (usd > 0) push('Cena USD', `${usd} USD`);

  return out;
}
