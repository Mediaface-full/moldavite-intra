/**
 * Zpracování fronty EtsyJob: každý job srovná listing na Etsy s požadovaným stavem kamene
 * (lib/etsy/state.ts) — vytvoří, aktualizuje, stáhne nebo smaže. Druh jobu (deactivate/activate/sync)
 * je jen důvod a priorita; o tom, co se stane, rozhoduje vždy aktuální stav v DB.
 *
 * Jádro (processJob, sweepWith, reconcileWith) bere závislosti zvenku → testy bez DB a bez Etsy.
 * Napojení na Prisma: processDueJobs, sweepEtsyDrift, reconcileWithEtsy (dole).
 *
 * Souběh: joby se berou „na lhůtu“ (runAfter += 5 min ve stejném UPDATE … FOR UPDATE SKIP LOCKED),
 * jeden kámen se v procesu zpracovává vždy jen jednou najednou (busyItems) — jinak by okamžité
 * spuštění po rezervaci a tik plánovače mohly založit dva listingy.
 */
import { prisma } from '@/lib/prisma';
import { getLatestRates } from '@/lib/rates';
import { buildCatalogItem, type CatalogSourceItem } from '@/lib/shop/catalog';
import type { ShopModifierConfig } from '@/lib/pricing/shopModifier';
import { EtsyApiError, type EtsyClient } from './client';
import { getEtsyClient } from './connection';
import { etsyContentHash, etsyDescription, etsyPrice, etsyTags, etsyTitle, DEFAULT_ETSY_MATERIALS } from './content';
import { etsyPhotoJpeg, etsyPhotoPlan, type EtsyPhotoEntry } from './photos';
import { desiredEtsyState } from './state';
import { enqueueEtsyJob, type EtsyJobKind } from './queue';
import { alertEtsy } from './alerts';

export const RETRY_DELAYS_MS = [10_000, 30_000, 120_000, 600_000, 3_600_000];
const LEASE_MS = 5 * 60_000;
const ALERT_AT_ATTEMPT = 3;

export interface JobRow { id: number; itemId: number; kind: string; attempts: number }
export interface ListingSnapshot { listingId: bigint | null; state: string; syncedHash: string; imageIds: bigint[]; inactiveSince: Date | null; alertedAt?: Date | null }
export interface ItemSnapshot {
  id: number; catalogNumber: string; nameEn: string; descriptionEn: string; longDescriptionEn: string; weight: string; pasShape: string;
  onEtsy: boolean; sold: boolean; soldChannel: string; eligible: boolean; activeReservation: boolean; finalCzk: string;
  photoPath: string; mainPhoto: number; shopPhotos: number[]; aiPhotos: unknown;
  listing: ListingSnapshot | null;
}
export interface EtsySettingsSnapshot {
  taxonomyId: number | null; shippingProfileId: bigint | null; readinessStateId: bigint | null; returnPolicyId: bigint | null;
  whoMade: string; whenMade: string; isSupply: boolean; tags: string[]; materials: string[];
}
export interface WorkerContext {
  settings: EtsySettingsSnapshot; cfg: ShopModifierConfig; currency: string; rates: Record<string, number>;
  settingsVersion: string; verifyBaseUrl: string;
}
export type ListingPatch = Partial<{
  listingId: bigint | null; state: string; blockedReason: string | null; syncedHash: string; imageIds: bigint[];
  priceSent: number | null; lastSyncAt: Date; lastError: string | null; errorCount: number; inactiveSince: Date | null; alertedAt: Date | null;
}>;
export interface WorkerDeps {
  clientFactory: () => Promise<EtsyClient | null>;
  loadItem: (itemId: number) => Promise<ItemSnapshot | null>;
  loadContext: () => Promise<WorkerContext>;
  saveListing: (itemId: number, patch: ListingPatch) => Promise<void>;
  completeJob: (jobId: number) => Promise<void>;
  failJob: (jobId: number, attempts: number, runAfter: Date, error: string) => Promise<void>;
  enqueue: (itemId: number, kind: EtsyJobKind, reason: string) => Promise<void>; // neurgentní (sweep, reconcile)
  photos: { plan: (item: ItemSnapshot) => EtsyPhotoEntry[]; jpeg: (e: EtsyPhotoEntry) => Promise<Buffer> };
  alert: typeof alertEtsy;
  now: () => Date;
}

// ── Obsah listingu ─────────────────────────────────────────────

interface Built { title: string; description: string; tags: string[]; materials: string[]; price: number | null; photos: EtsyPhotoEntry[]; contentHash: string; photoHash: string }

function build(item: ItemSnapshot, ctx: WorkerContext, d: WorkerDeps): Built {
  const src = { catalogNumber: item.catalogNumber, nameEn: item.nameEn, descriptionEn: item.descriptionEn, longDescriptionEn: item.longDescriptionEn, weight: item.weight, pasShape: item.pasShape };
  const title = etsyTitle(src);
  const description = etsyDescription(src, ctx.verifyBaseUrl);
  const tags = etsyTags(ctx.settings.tags, item.pasShape);
  const materials = ctx.settings.materials.length ? ctx.settings.materials : DEFAULT_ETSY_MATERIALS;
  const price = etsyPrice(item.finalCzk, ctx.cfg, ctx.currency, ctx.rates);
  const photos = d.photos.plan(item);
  const photoFiles = photos.map((p) => p.file.split('/').slice(-2).join('/'));
  // Otisk ve dvou částech: obsah (texty, cena, nastavení) | fotky — fotky se nahrávají znovu jen při jejich změně.
  const contentHash = etsyContentHash({ title, description, tags, materials, price: price ?? 0, photoFiles: [], settingsVersion: ctx.settingsVersion });
  const photoHash = etsyContentHash({ title: '', description: '', tags: [], materials: [], price: 0, photoFiles, settingsVersion: '' });
  return { title, description, tags, materials, price, photos, contentHash, photoHash };
}

export function syncedHashOf(b: Pick<Built, 'contentHash' | 'photoHash'>): string { return `${b.contentHash}|${b.photoHash}`; }

/** Stavy na Etsy, které splňují „stažený“ (sold_out = prodáno na Etsy, expired = vypršel) — review I6. */
const OFF_STATES = new Set(['inactive', 'sold_out', 'expired']);

function missingSettings(s: EtsySettingsSnapshot): boolean {
  return !s.taxonomyId || !s.shippingProfileId || !s.readinessStateId;
}

function desiredFor(item: ItemSnapshot, now: Date) {
  return desiredEtsyState({
    onEtsy: item.onEtsy, sold: item.sold, eligible: item.eligible, activeReservation: item.activeReservation,
    listingId: item.listing?.listingId ?? null, inactiveSince: item.listing?.inactiveSince ?? null, now,
  });
}

/** Potřebuje kámen zásah na Etsy? (sweep) */
function needsWork(item: ItemSnapshot, ctx: WorkerContext, d: WorkerDeps): boolean {
  const want = desiredFor(item, d.now());
  const l = item.listing;
  if (want.state === 'none') return false;
  if (want.state === 'removed') return true;
  if (want.state === 'inactive') return !OFF_STATES.has(l?.state ?? '');
  if (!l?.listingId || l.state !== 'active') return true;
  return l.syncedHash !== syncedHashOf(build(item, ctx, d));
}

// ── Jeden job ─────────────────────────────────────────────────

export async function processJob(job: JobRow, d: WorkerDeps): Promise<'done' | 'retry' | 'skipped'> {
  const item = await d.loadItem(job.itemId);
  if (!item) { await d.completeJob(job.id); return 'done'; }
  const ctx = await d.loadContext();
  const want = desiredFor(item, d.now());
  const l = item.listing;

  if (want.state === 'none') {
    await d.saveListing(item.id, { blockedReason: want.blockedReason });
    await d.completeJob(job.id);
    return 'done';
  }
  if (want.state === 'active' && missingSettings(ctx.settings)) {
    await d.saveListing(item.id, { state: 'error', lastError: 'Etsy: doplň nastavení v Administraci → Etsy (kategorie, doprava, doba odeslání)', blockedReason: null });
    await d.completeJob(job.id);
    return 'done';
  }

  // Prodáno na Etsy: listing je tam sold_out sám od sebe — nic nevolat (PATCH na sold_out by mohl selhat; review I6)
  if (want.state === 'inactive' && item.sold && item.soldChannel === 'etsy') {
    await d.saveListing(item.id, { state: 'sold_out', blockedReason: 'sold', inactiveSince: l?.inactiveSince ?? d.now(), lastError: null, alertedAt: null });
    await d.completeJob(job.id);
    return 'done';
  }

  try {
    // Uvnitř try: dočasné selhání obnovy přístupu (výjimka) jde cestou opakování a upozornění (review I5)
    const client = await d.clientFactory();
    if (!client) return 'skipped'; // obchod odpojený — job počká, upozornění už odešlo při odpojení

    if (want.state === 'inactive') {
      if (l?.listingId && !OFF_STATES.has(l.state)) await client.updateListing(l.listingId, { state: 'inactive' });
      await d.saveListing(item.id, { state: OFF_STATES.has(l?.state ?? '') ? l!.state : 'inactive', blockedReason: want.blockedReason, inactiveSince: l?.inactiveSince ?? d.now(), lastSyncAt: d.now(), lastError: null, errorCount: 0, alertedAt: null });
    } else if (want.state === 'removed') {
      if (l?.listingId) await client.deleteListing(l.listingId);
      await d.saveListing(item.id, { listingId: null, state: 'removed', imageIds: [], lastSyncAt: d.now(), lastError: null, errorCount: 0 });
    } else {
      await syncActive(item, l, ctx, client, d);
    }
    await d.completeJob(job.id);
    return 'done';
  } catch (err) {
    if (err instanceof EtsyApiError && err.status === 404 && l?.listingId) {
      // Listing na Etsy už není (smazán ručně) — zapomenout ho; má-li být aktivní, sweep ho založí znovu.
      await d.saveListing(item.id, { listingId: null, state: 'none', imageIds: [], lastError: null });
      await d.completeJob(job.id);
      return 'done';
    }
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    if (err instanceof EtsyApiError && err.retryable) {
      const attempts = job.attempts + 1;
      const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
      await d.failJob(job.id, attempts, new Date(d.now().getTime() + delay), message);
      if (attempts >= ALERT_AT_ATTEMPT && want.state !== 'active') await alertOnce(item, message, d);
      return 'retry';
    }
    await d.saveListing(item.id, { state: 'error', lastError: message });
    if (want.state !== 'active') await alertOnce(item, message, d); // trvalá chyba při stahování → hned (review I5b)
    await d.completeJob(job.id);
    return 'done';
  }
}

/** Upozornění „nejde stáhnout“ max jednou na kámen, dokud se stažení nepovede (review I1). */
async function alertOnce(item: ItemSnapshot, message: string, d: WorkerDeps) {
  if (item.listing?.alertedAt) return;
  await d.alert('deactivate_failing', { catalogNumber: item.catalogNumber, note: message });
  await d.saveListing(item.id, { alertedAt: d.now() });
}

async function syncActive(item: ItemSnapshot, l: ListingSnapshot | null, ctx: WorkerContext, client: EtsyClient, d: WorkerDeps) {
  const b = build(item, ctx, d);
  if (b.price === null) throw new EtsyApiError(0, `chybí kurz ${ctx.currency} nebo cena kamene`, false);
  if (!b.photos.length) throw new EtsyApiError(0, 'kámen nemá fotky', false);
  const s = ctx.settings;
  const content = {
    title: b.title, description: b.description, price: b.price, who_made: s.whoMade, when_made: s.whenMade,
    taxonomy_id: s.taxonomyId!, shipping_profile_id: s.shippingProfileId!, readiness_state_id: s.readinessStateId!,
    return_policy_id: s.returnPolicyId, tags: b.tags, materials: b.materials, is_supply: s.isSupply, should_auto_renew: true,
  };
  const [oldContent, oldPhotos] = (l?.syncedHash ?? '').split('|');

  let listingId = l?.listingId ?? null;
  let imageIds = l?.imageIds ?? [];
  let created = false;
  if (!listingId) {
    const r = await client.createDraftListing({ quantity: 1, ...content });
    listingId = BigInt(r.listing_id);
    created = true;
    await d.saveListing(item.id, { listingId, state: 'draft', imageIds: [] }); // ať případný pád nezaloží druhý listing
    imageIds = [];
  } else if (oldContent !== b.contentHash) {
    await client.updateListing(listingId, content);
  }

  if (created || oldPhotos !== b.photoHash) {
    for (const id of imageIds) await client.deleteListingImage(listingId, id);
    imageIds = [];
    for (let i = 0; i < b.photos.length; i++) {
      const jpeg = await d.photos.jpeg(b.photos[i]);
      const r = await client.uploadListingImage(listingId, jpeg, i + 1, `${item.catalogNumber}-${i + 1}.jpg`);
      imageIds.push(BigInt(r.listing_image_id));
    }
  }
  if (created || oldContent !== b.contentHash) {
    await client.updateInventory(listingId, item.catalogNumber, b.price, s.readinessStateId!);
  }
  if (created || l?.state !== 'active') await client.updateListing(listingId, { state: 'active' });

  await d.saveListing(item.id, {
    listingId, state: 'active', blockedReason: null, syncedHash: syncedHashOf(b), imageIds, priceSent: b.price,
    lastSyncAt: d.now(), lastError: null, errorCount: 0, inactiveSince: null, alertedAt: null,
  });
}

// ── Sweep a denní kontrola ──────────────────────────────────────

export async function sweepWith(items: ItemSnapshot[], d: WorkerDeps): Promise<number> {
  const ctx = await d.loadContext();
  let n = 0;
  for (const item of items) {
    if (needsWork(item, ctx, d)) { await d.enqueue(item.id, 'sync', 'drift'); n++; }
  }
  return n;
}

export async function reconcileWith(items: ItemSnapshot[], d: WorkerDeps): Promise<{ checked: number; fixed: number }> {
  const client = await d.clientFactory();
  if (!client) return { checked: 0, fixed: 0 };
  let checked = 0, fixed = 0;
  for (const item of items) {
    const l = item.listing;
    if (!l?.listingId) continue;
    checked++;
    try {
      const remote = await client.getListing(l.listingId);
      const want = desiredFor(item, d.now());
      const ok = want.state === 'active' ? remote.state === 'active' : OFF_STATES.has(remote.state);
      if (!ok) {
        await d.saveListing(item.id, { state: remote.state });
        await d.enqueue(item.id, 'sync', 'reconcile');
        fixed++;
      }
    } catch (err) {
      if (err instanceof EtsyApiError && err.status === 404) {
        await d.saveListing(item.id, { listingId: null, state: 'none', imageIds: [] });
        await d.enqueue(item.id, 'sync', 'reconcile');
        fixed++;
      } else {
        console.error(`[etsy] kontrola ${item.catalogNumber} selhala`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { checked, fixed };
}

// ── Napojení na Prisma ──────────────────────────────────────────

// Sdílené přes globalThis — plánovač (instrumentation) a route handlery jsou v Next oddělené moduly (review I2)
const gw = globalThis as unknown as { __etsyBusyItems?: Set<number> };
const busyItems = (gw.__etsyBusyItems ??= new Set<number>());

const itemSelect = {
  id: true, evidNumber: true, nameEn: true, name: true, description: true, descriptionEn: true, longDescription: true, longDescriptionEn: true,
  location: true, pasShape: true, attrDamage: true, attrColor: true, attrCollectible: true, weight: true, weightCt: true,
  finalInternalPriceInclVatCzk: true, pricingStatus: true, onShop: true, onShopAt: true, onEtsy: true, sold: true, soldAt: true,
  certHash: true, certIssuedAt: true, photoPath: true, mainPhoto: true, shopPhotos: true, aiPhotos: true, storage: true, updatedAt: true,
  box: { select: { code: true } },
  soldChannel: true,
  etsyListing: { select: { listingId: true, state: true, syncedHash: true, imageIds: true, inactiveSince: true, alertedAt: true } },
} as const;

type ItemRow = NonNullable<Awaited<ReturnType<typeof loadRows>>>[number];
async function loadRows(where: object) {
  const now = new Date();
  return prisma.item.findMany({
    where,
    select: { ...itemSelect, shopReservations: { where: { releasedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 } },
  });
}

async function toSnapshots(rows: ItemRow[]): Promise<ItemSnapshot[]> {
  const options = await prisma.attrOption.findMany({ where: { attrKey: { in: ['location', 'pasShape', 'attrColor', 'attrDamage'] } } });
  return rows.map((r) => {
    // Způsobilost = stejná pravidla jako katalog e-shopu (cena, váha, stav cenotvorby, atributy v číselníku)
    const built = buildCatalogItem({ ...(r as unknown as CatalogSourceItem), sold: false }, { options, rates: {}, photos: () => ({ photos: [], video: null }) });
    return {
      id: r.id, catalogNumber: `${r.box.code}-${r.evidNumber}`, nameEn: r.nameEn, descriptionEn: r.descriptionEn, longDescriptionEn: r.longDescriptionEn,
      weight: r.weight.toString(), pasShape: r.pasShape, onEtsy: r.onEtsy, sold: r.sold, soldChannel: r.soldChannel, eligible: !('skip' in built),
      activeReservation: r.shopReservations.length > 0, finalCzk: r.finalInternalPriceInclVatCzk?.toString() ?? '0',
      photoPath: r.photoPath, mainPhoto: r.mainPhoto, shopPhotos: r.shopPhotos, aiPhotos: r.aiPhotos,
      listing: r.etsyListing,
    };
  });
}

async function loadContextFromDb(): Promise<WorkerContext> {
  const [settings, exportCfg, conn, rates] = await Promise.all([
    prisma.etsySettings.findUnique({ where: { id: 1 } }),
    prisma.exportConfig.findUnique({ where: { exportType: 'etsy' } }),
    prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
    getLatestRates(),
  ]);
  const rateMap: Record<string, number> = {};
  for (const [code, r] of Object.entries(rates ?? {})) {
    const perUnit = Number(r.rate) / (r.quantity || 1);
    if (perUnit > 0) rateMap[code] = perUnit;
  }
  const cfg = { commissionPct: Number(exportCfg?.commission ?? 0), roundingStep: exportCfg?.roundingStep ?? 0 };
  return {
    settings: {
      taxonomyId: settings?.taxonomyId ?? null, shippingProfileId: settings?.shippingProfileId ?? null, readinessStateId: settings?.readinessStateId ?? null,
      returnPolicyId: settings?.returnPolicyId ?? null, whoMade: settings?.whoMade ?? 'someone_else', whenMade: settings?.whenMade ?? 'before_2007',
      isSupply: settings?.isSupply ?? false, tags: settings?.tags ?? [], materials: settings?.materials ?? [],
    },
    cfg, currency: conn?.currencyCode ?? 'EUR', rates: rateMap,
    settingsVersion: `${settings?.updatedAt?.toISOString() ?? ''}|${cfg.commissionPct}|${cfg.roundingStep}`,
    verifyBaseUrl: process.env.VERIFY_BASE_URL || 'https://verify.bohemianmoldavite.com',
  };
}

export function prismaDeps(over: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    clientFactory: () => getEtsyClient(),
    loadItem: async (itemId) => (await toSnapshots(await loadRows({ id: itemId })))[0] ?? null,
    loadContext: loadContextFromDb,
    saveListing: async (itemId, patch) => {
      await prisma.etsyListing.upsert({ where: { itemId }, create: { itemId, ...patch }, update: patch });
    },
    completeJob: async (jobId) => { await prisma.etsyJob.update({ where: { id: jobId }, data: { doneAt: new Date(), leasedUntil: null } }); },
    failJob: async (jobId, attempts, runAfter, error) => {
      await prisma.etsyJob.update({ where: { id: jobId }, data: { attempts, runAfter, lastError: error, leasedUntil: null } });
    },
    enqueue: (itemId, kind, reason) => enqueueEtsyJob(prisma, itemId, kind, reason, { urgent: false }),
    photos: { plan: (i) => etsyPhotoPlan(i), jpeg: etsyPhotoJpeg },
    alert: alertEtsy,
    now: () => new Date(),
    ...over,
  };
}

/** Vezme splatné joby (na lhůtu 5 min) a zpracuje je; jeden kámen nikdy dvakrát souběžně. */
export async function processDueJobs(opts: { itemIds?: number[]; limit?: number; deps?: WorkerDeps } = {}): Promise<{ done: number; failed: number }> {
  const d = opts.deps ?? prismaDeps();
  const limit = opts.limit ?? 10;
  const ids = opts.itemIds?.length ? opts.itemIds : null;
  // Lhůta je zvlášť (leasedUntil) — nové zařazení posune runAfter, ale běžící job znovu nevezme (review I1/I2)
  const lease = `${LEASE_MS / 1000} seconds`;
  const jobs = ids
    ? await prisma.$queryRaw<JobRow[]>`UPDATE "EtsyJob" SET "leasedUntil" = now() + ${lease}::interval WHERE id IN (SELECT id FROM "EtsyJob" WHERE "doneAt" IS NULL AND "runAfter" <= now() AND ("leasedUntil" IS NULL OR "leasedUntil" < now()) AND "itemId" = ANY(${ids}) ORDER BY "runAfter" LIMIT ${limit} FOR UPDATE SKIP LOCKED) RETURNING id, "itemId", kind, attempts`
    : await prisma.$queryRaw<JobRow[]>`UPDATE "EtsyJob" SET "leasedUntil" = now() + ${lease}::interval WHERE id IN (SELECT id FROM "EtsyJob" WHERE "doneAt" IS NULL AND "runAfter" <= now() AND ("leasedUntil" IS NULL OR "leasedUntil" < now()) ORDER BY "runAfter" LIMIT ${limit} FOR UPDATE SKIP LOCKED) RETURNING id, "itemId", kind, attempts`;
  let done = 0, failed = 0;
  for (const job of jobs) {
    if (busyItems.has(job.itemId)) {
      await prisma.etsyJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() + 5_000), leasedUntil: null } });
      continue;
    }
    busyItems.add(job.itemId);
    try {
      const r = await processJob(job, d);
      if (r === 'done') done++;
      else if (r === 'retry') failed++;
      else await prisma.etsyJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() + 60_000), leasedUntil: null } }); // nepřipojeno
    } catch (err) {
      failed++;
      await prisma.etsyJob.update({ where: { id: job.id }, data: { leasedUntil: null, runAfter: new Date(Date.now() + 60_000) } }).catch(() => {});
      console.error('[etsy] job spadl', job.id, job.itemId, err instanceof Error ? err.message : err);
    } finally {
      busyItems.delete(job.itemId);
    }
  }
  return { done, failed };
}

/** Kameny, kterých se Etsy týká: zapnuté na Etsy, nebo s existujícím listingem. */
async function etsyCandidates(): Promise<ItemSnapshot[]> {
  return toSnapshots(await loadRows({ OR: [{ onEtsy: true }, { etsyListing: { isNot: null } }] }));
}

export async function sweepEtsyDrift(): Promise<number> {
  return sweepWith(await etsyCandidates(), prismaDeps());
}

export async function reconcileWithEtsy(): Promise<{ checked: number; fixed: number }> {
  return reconcileWith(await etsyCandidates(), prismaDeps());
}
