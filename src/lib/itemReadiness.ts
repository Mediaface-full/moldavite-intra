/**
 * Kontrola připravenosti kamene — pure funkce pro `StoneReadinessCard`
 * (redesign detailu kamene, docs/REDESIGN-DETAIL-KAMENE.md §4 D).
 *
 * Vstup je kombinace živého formuláře (texty, atributy — mění se při psaní)
 * a serverových faktů (média na disku, certifikát, stav ceny).
 */
export type PricingStatus = 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE';

export interface ItemMediaInfo {
  /** počet souborů NN.jpg (01–24) v adresáři kamene */
  photoCount: number;
  has360: boolean;
  hasVideo: boolean;
  hasFilm: boolean;
}

export interface ReadinessInput {
  name: string;
  description: string;
  descriptionEn: string;
  longDescription: string;
  longDescriptionEn: string;
  pasShape: string;
  attrDamage: string;
  attrColor: string[];
  location: string;
  weight: string;
  pricingStatus: PricingStatus | null | undefined;
  onShop: boolean;
  onEtsy: boolean;
  certHash: string;
  media: ItemMediaInfo;
}

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  /** doplněk za labelem, např. „24 fotek" nebo „chybí tvar, barva" */
  detail?: string;
  /** volitelná položka — ukáže se v seznamu, ale do score/total se nepočítá (video; Gideon 12. 10. 2026) */
  optional?: boolean;
  /** id sekce, kam odskrolovat při kliku na ✗ */
  anchor?: string;
}

export interface Readiness {
  items: ReadinessItem[];
  score: number;
  total: number;
}

function hasText(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.replace(/<[^>]*>/g, '').trim().length > 0;
}

export function computeReadiness(i: ReadinessInput): Readiness {
  const w = Number(String(i.weight ?? '').replace(',', '.'));
  const missingAttrs: string[] = [];
  if (!i.pasShape) missingAttrs.push('tvar');
  if (!i.attrDamage) missingAttrs.push('poškození');
  if (!i.attrColor || i.attrColor.length === 0) missingAttrs.push('barva');
  if (!i.location) missingAttrs.push('místo nálezu');
  if (!Number.isFinite(w) || w <= 0) missingAttrs.push('hmotnost');

  const items: ReadinessItem[] = [
    { key: 'photos', label: 'Fotky', ok: i.media.photoCount > 0, detail: i.media.photoCount > 0 ? `${i.media.photoCount}` : 'žádné', anchor: 'media' },
    { key: 'photos360', label: '360°', ok: i.media.has360, detail: i.media.has360 ? '24 fotek' : `${i.media.photoCount}/24`, anchor: 'media' },
    { key: 'video', label: 'Video', ok: i.media.hasVideo, anchor: 'media', optional: true },
    { key: 'film', label: 'Film', ok: i.media.hasFilm, anchor: 'media' },
    { key: 'cert', label: 'Certifikát', ok: hasText(i.certHash), anchor: 'media' },
    { key: 'name', label: 'Název', ok: hasText(i.name), anchor: 'identity' },
    { key: 'descCz', label: 'Krátký popis CZ', ok: hasText(i.description), anchor: 'identity' },
    { key: 'descEn', label: 'Krátký popis EN', ok: hasText(i.descriptionEn), anchor: 'identity' },
    { key: 'longCz', label: 'Dlouhý popis CZ', ok: hasText(i.longDescription), anchor: 'content' },
    { key: 'longEn', label: 'Dlouhý popis EN', ok: hasText(i.longDescriptionEn), anchor: 'content' },
    { key: 'attrs', label: 'Atributy', ok: missingAttrs.length === 0, detail: missingAttrs.length ? `chybí ${missingAttrs.join(', ')}` : undefined, anchor: 'attributes' },
    { key: 'price', label: 'Cena', ok: i.pricingStatus === 'OK', detail: i.pricingStatus === 'STALE' ? 'zastaralá — přepočítat' : i.pricingStatus && i.pricingStatus !== 'OK' ? 'nespočítána' : undefined, anchor: 'pricing' },
    { key: 'shop', label: 'E-shop', ok: i.onShop, detail: i.onShop ? 'vystaveno' : 'nevystaveno', anchor: 'publishing' },
    { key: 'etsy', label: 'Etsy', ok: i.onEtsy, detail: i.onEtsy ? 'vystaveno' : 'nevystaveno', anchor: 'publishing' },
  ];
  const counted = items.filter((x) => !x.optional);
  return { items, score: counted.filter((x) => x.ok).length, total: counted.length };
}
