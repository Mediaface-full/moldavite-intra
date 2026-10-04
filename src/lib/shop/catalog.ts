/**
 * Katalog pro e-shop BM SHOP (GET /api/shop/v1/catalog). Kontrakt: app/docs/SHOP-API.md.
 *
 * Čisté funkce (buildCatalogItem, shopEligibility, shopPrices, dictionaries) jsou odděleně od
 * načítání z DB (loadCatalog), aby šly testovat bez Prisma — viz lib/shop/__tests__/catalog.test.ts.
 */
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getLatestRates } from '@/lib/rates';

export const SHOP_API_VERSION = 1;
export const SHOP_DICT_KEYS = ['location', 'pasShape', 'attrColor', 'attrDamage'] as const;
export type ShopDictKey = (typeof SHOP_DICT_KEYS)[number];
export const SOLD_VISIBLE_DAYS = 365;
const PHOTO_SLOTS = 24;

export type DictOption = { id: number; attrKey: string; value: string; label: string | null; labelEn: string | null; sortOrder: number; active: boolean };
export type ShopDictEntry = { id: number; value: string; cs: string; en: string; order: number };
export type SkipReason = 'no_weight' | 'no_price' | 'pricing_needs_input' | 'pricing_needs_review' | 'unknown_attr';

/** Minimální tvar Item (+ box.code) potřebný pro katalog — odpovídá Prisma modelu. */
export type CatalogSourceItem = {
  id: number;
  evidNumber: string;
  box: { code: string };
  name: string; nameEn: string;
  description: string; descriptionEn: string;
  longDescription: string; longDescriptionEn: string;
  location: string; pasShape: string; attrDamage: string; attrColor: string[]; attrCollectible: boolean;
  weight: unknown; weightCt: unknown;
  finalInternalPriceInclVatCzk: unknown;
  pricingStatus: string;
  onShop: boolean; onShopAt: Date | null;
  sold: boolean; soldAt: Date | null;
  certHash: string; certIssuedAt: Date | null;
  photoPath: string; mainPhoto: number;
  storage: string;
  updatedAt: Date;
  activeReservation?: boolean;
};

export type CatalogItem = {
  id: number; sku: string; state: 'available' | 'reserved' | 'sold';
  updatedAt: string; listedAt: string | null; soldAt: string | null;
  name: { cs: string; en: string }; short: { cs: string; en: string }; description: { cs: string; en: string };
  prices: Record<string, number>;
  weightG: number; weightCt: number;
  attrs: Record<ShopDictKey, number[]>;
  collectible: boolean;
  cert: { hash: string | null; issuedAt: string | null };
  photos: string[]; video: string | null;
  storage: string;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const skuOf = (item: { box: { code: string }; evidNumber: string }) => `${item.box.code}-${item.evidNumber}`;

/** Stejná pravidla jako gate v PATCH /api/items/[id] (vystavení na shop). null = smí do e-shopu. */
export function shopEligibility(item: Pick<CatalogSourceItem, 'weight' | 'finalInternalPriceInclVatCzk' | 'pricingStatus'>): SkipReason | null {
  if (num(item.weight) <= 0) return 'no_weight';
  if (num(item.finalInternalPriceInclVatCzk) <= 0) return 'no_price';
  if (item.pricingStatus === 'NEEDS_INPUT') return 'pricing_needs_input';
  if (item.pricingStatus === 'NEEDS_REVIEW') return 'pricing_needs_review';
  return null;
}

/** CZK = finální cena; další měny = round(CZK / kurz) — stejný výpočet jako lib/exchangeRates.ts. */
export function shopPrices(czk: number, rates: Record<string, number>): Record<string, number> {
  const prices: Record<string, number> = { CZK: Math.round(czk) };
  for (const [code, rate] of Object.entries(rates)) {
    if (rate > 0) prices[code] = Math.round(czk / rate);
  }
  return prices;
}

/** Číselníky pro e-shop: jen aktivní, řazené sortOrder. EN fallback labelEn → label → value. */
export function buildDictionaries(options: DictOption[]): Record<ShopDictKey, ShopDictEntry[]> {
  const out = Object.fromEntries(SHOP_DICT_KEYS.map((k) => [k, [] as ShopDictEntry[]])) as Record<ShopDictKey, ShopDictEntry[]>;
  for (const o of [...options].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
    if (!o.active || !(SHOP_DICT_KEYS as readonly string[]).includes(o.attrKey)) continue;
    const cs = o.label || o.value;
    out[o.attrKey as ShopDictKey].push({ id: o.id, value: o.value, cs, en: o.labelEn || cs, order: o.sortOrder });
  }
  return out;
}

/** value → id, porovnání bez ohledu na velikost písmen a okolní mezery (Item ukládá text). */
function idLookup(options: DictOption[]): (key: ShopDictKey, value: string) => number | null {
  const map = new Map<string, number>();
  for (const o of options) map.set(`${o.attrKey}:${o.value.trim().toLowerCase()}`, o.id);
  return (key, value) => map.get(`${key}:${value.trim().toLowerCase()}`) ?? null;
}

export type PhotoResolver = (photoPath: string, mainPhoto: number) => { photos: string[]; video: string | null };

/**
 * Sestaví položku katalogu nebo vrátí důvod vyřazení.
 * Povinné atributy (lokalita, tvar, barva, stav) musí existovat v číselníku — jinak `unknown_attr`.
 */
export function buildCatalogItem(
  item: CatalogSourceItem,
  ctx: { options: DictOption[]; rates: Record<string, number>; photos: PhotoResolver },
): CatalogItem | { skip: SkipReason } {
  const reason = shopEligibility(item);
  if (reason && !item.sold) return { skip: reason };

  const lookup = idLookup(ctx.options);
  const one = (key: ShopDictKey, v: string) => (v ? lookup(key, v) : null);
  const attrs: Record<ShopDictKey, number[]> = {
    location: [one('location', item.location)].filter((x): x is number => x !== null),
    pasShape: [one('pasShape', item.pasShape)].filter((x): x is number => x !== null),
    attrColor: (item.attrColor ?? []).map((c) => one('attrColor', c)).filter((x): x is number => x !== null),
    attrDamage: [one('attrDamage', item.attrDamage)].filter((x): x is number => x !== null),
  };
  if (!item.sold && (!attrs.location.length || !attrs.pasShape.length || !attrs.attrColor.length || !attrs.attrDamage.length)) {
    return { skip: 'unknown_attr' };
  }

  const weightG = num(item.weight);
  const weightCt = num(item.weightCt) || Math.round(weightG * 5 * 100) / 100;
  const { photos, video } = ctx.photos(item.photoPath, item.mainPhoto);

  return {
    id: item.id,
    sku: skuOf(item),
    state: item.sold ? 'sold' : item.activeReservation ? 'reserved' : 'available',
    updatedAt: item.updatedAt.toISOString(),
    listedAt: item.onShopAt ? item.onShopAt.toISOString() : null,
    soldAt: item.soldAt ? item.soldAt.toISOString() : null,
    name: { cs: item.name, en: item.nameEn || item.name },
    short: { cs: item.description, en: item.descriptionEn },
    description: { cs: item.longDescription, en: item.longDescriptionEn },
    prices: shopPrices(num(item.finalInternalPriceInclVatCzk), ctx.rates),
    weightG,
    weightCt,
    attrs,
    collectible: item.attrCollectible,
    cert: { hash: item.certHash || null, issuedAt: item.certIssuedAt ? item.certIssuedAt.toISOString() : null },
    photos,
    video,
    storage: item.storage,
  };
}

/**
 * Fotky z disku (PHOTOS_PATH): 01–24 (.jpg/.jpeg/.png/.webp), hlavní (mainPhoto) první.
 * URL vede na veřejnou route /images (WebP se vyrobí on-demand), jen pro soubory, které existují.
 * Stejná ochrana cesty jako /images route: žádné „..", výsledek musí zůstat pod PHOTOS_PATH.
 */
export function diskPhotoResolver(baseUrl: string, photosRoot = process.env.PHOTOS_PATH || path.join(process.cwd(), '..', 'kameny', 'FOTO_MOLDAVITE')): PhotoResolver {
  const root = path.resolve(photosRoot);
  return (photoPath, mainPhoto) => {
    if (!photoPath || photoPath.includes('..') || photoPath.includes('\0') || photoPath.includes('\\')) {
      return { photos: [], video: null };
    }
    const dir = path.resolve(root, photoPath);
    if (!dir.startsWith(root + path.sep)) return { photos: [], video: null };

    const segs = photoPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const slots: number[] = [];
    for (let n = 1; n <= PHOTO_SLOTS; n++) {
      const nn = String(n).padStart(2, '0');
      if (['jpg', 'jpeg', 'png', 'webp'].some((ext) => existsSync(path.join(dir, `${nn}.${ext}`)))) slots.push(n);
    }
    const main = Number.isInteger(mainPhoto) && slots.includes(mainPhoto) ? mainPhoto : slots[0];
    const ordered = main ? [main, ...slots.filter((n) => n !== main)] : [];
    return {
      photos: ordered.map((n) => `${baseUrl}/images/${segs}/${String(n).padStart(2, '0')}.webp`),
      video: existsSync(path.join(dir, 'video.mp4')) ? `${baseUrl}/images/${segs}/video.mp4` : null,
    };
  };
}

/** Načte a sestaví celý katalog (plný snímek). */
export async function loadCatalog(baseUrl: string, photos: PhotoResolver = diskPhotoResolver(baseUrl)) {
  const soldSince = new Date(Date.now() - SOLD_VISIBLE_DAYS * 86_400_000);
  const now = new Date();

  const [items, options, rates] = await Promise.all([
    prisma.item.findMany({
      where: {
        OR: [
          { onShop: true, sold: false },
          { sold: true, onShopAt: { not: null }, soldAt: { gte: soldSince } },
        ],
      },
      include: {
        box: { select: { code: true } },
        shopReservations: { where: { releasedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 },
      },
      orderBy: [{ boxId: 'asc' }, { evidNumber: 'asc' }],
    }),
    prisma.attrOption.findMany({ where: { attrKey: { in: [...SHOP_DICT_KEYS] } } }),
    getLatestRates(),
  ]);

  const rateMap: Record<string, number> = {};
  let ratesFetchedAt: string | null = null;
  for (const [code, r] of Object.entries(rates ?? {})) {
    const rate = r as { rate: unknown; quantity?: number; fetchedAt?: Date };
    const perUnit = num(rate.rate) / (rate.quantity || 1);
    if (perUnit > 0) rateMap[code] = perUnit;
    if (rate.fetchedAt && (!ratesFetchedAt || rate.fetchedAt.toISOString() > ratesFetchedAt)) ratesFetchedAt = rate.fetchedAt.toISOString();
  }

  const catalogItems: CatalogItem[] = [];
  const skipped: { id: number; sku: string; reason: SkipReason }[] = [];
  for (const raw of items) {
    const built = buildCatalogItem(
      { ...(raw as unknown as CatalogSourceItem), activeReservation: raw.shopReservations.length > 0 },
      { options, rates: rateMap, photos },
    );
    if ('skip' in built) skipped.push({ id: raw.id, sku: skuOf(raw), reason: built.skip });
    else catalogItems.push(built);
  }

  return {
    version: SHOP_API_VERSION,
    generatedAt: now.toISOString(),
    currency: { base: 'CZK', rates: rateMap, ratesFetchedAt },
    dictionaries: buildDictionaries(options),
    items: catalogItems,
    skipped,
  };
}
