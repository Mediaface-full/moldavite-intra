import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processJob, sweepWith, reconcileWith, RETRY_DELAYS_MS, type WorkerDeps, type ItemSnapshot, type WorkerContext, type JobRow } from '@/lib/etsy/worker';
import { EtsyApiError } from '@/lib/etsy/client';

const ctx: WorkerContext = {
  settings: { taxonomyId: 1, shippingProfileId: BigInt(11), readinessStateId: BigInt(22), returnPolicyId: null, whoMade: 'someone_else', whenMade: 'before_2007', isSupply: false, tags: [], materials: [] },
  cfg: { commissionPct: 0, roundingStep: 0 }, currency: 'EUR', rates: { EUR: 25 }, settingsVersion: 'v1', verifyBaseUrl: 'https://verify.example',
};
const item = (over: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: 1, catalogNumber: 'K0001-0001', nameEn: 'Moldavite', descriptionEn: '', longDescriptionEn: 'Long', weight: '5', pasShape: '',
  onEtsy: true, sold: false, soldChannel: '', eligible: true, activeReservation: false, finalCzk: '1000',
  photoPath: 'K0001/x', mainPhoto: 1, shopPhotos: [], aiPhotos: null, listing: null, ...over,
});
const job = (over: Partial<JobRow> = {}): JobRow => ({ id: 100, itemId: 1, kind: 'sync', attempts: 0, ...over });

function fakeClient() {
  const calls: string[] = [];
  const rec = (name: string, ret: unknown = {}) => vi.fn(async (...args: unknown[]) => { calls.push(`${name}${name === 'updateListing' ? ':' + JSON.stringify((args[1] as { state?: string }).state ?? 'content') : ''}`); return ret; });
  let n = 0;
  const client = {
    createDraftListing: rec('createDraftListing', { listing_id: 555, state: 'draft' }),
    uploadListingImage: vi.fn(async () => { calls.push('uploadListingImage'); return { listing_image_id: ++n }; }),
    deleteListingImage: rec('deleteListingImage'),
    updateInventory: rec('updateInventory'),
    updateListing: rec('updateListing', { listing_id: 555, state: 'active' }),
    deleteListing: rec('deleteListing'),
    getListing: rec('getListing', { listing_id: 555, state: 'active', quantity: 1 }),
    getDraftListings: vi.fn(async () => [] as Array<{ listing_id: number; title: string; created_timestamp: number }>),
  };
  return { calls, client };
}

function deps(snapshot: ItemSnapshot | null, client: unknown, over: Partial<WorkerDeps> = {}) {
  const saved: Record<string, unknown>[] = [];
  const jobs = { completed: [] as number[], failed: [] as { id: number; attempts: number; runAfter: Date; error: string }[], enqueued: [] as { itemId: number; reason: string }[] };
  const d: WorkerDeps = {
    clientFactory: async () => client as never,
    loadItem: async () => snapshot,
    loadContext: async () => ctx,
    saveListing: async (_id, patch) => { saved.push(patch); },
    completeJob: async (id) => { jobs.completed.push(id); },
    failJob: async (id, attempts, runAfter, error) => { jobs.failed.push({ id, attempts, runAfter, error }); },
    enqueue: async (itemId, _kind, reason) => { jobs.enqueued.push({ itemId, reason }); },
    photos: {
      plan: () => [1, 4, 7, 13].map((slot) => ({ slot, file: `/x/${String(slot).padStart(2, '0')}.jpg`, ai: false })),
      jpeg: async () => Buffer.from([0xff, 0xd8]),
    },
    alert: vi.fn(async () => {}),
    now: () => new Date('2026-12-01T12:00:00Z'),
    ...over,
  };
  return { d, saved, jobs };
}

beforeEach(() => { process.env.ETSY_KEYSTRING = 'ks'; });

describe('processJob', () => {
  it('nový kámen → vytvořit, 4 fotky, inventář, aktivovat', async () => {
    const { calls, client } = fakeClient();
    const { d, saved, jobs } = deps(item(), client);
    await processJob(job(), d);
    expect(calls).toEqual(['createDraftListing', 'uploadListingImage', 'uploadListingImage', 'uploadListingImage', 'uploadListingImage', 'updateInventory', 'updateListing:"active"']);
    expect(saved.at(-1)).toMatchObject({ listingId: BigInt(555), state: 'active', blockedReason: null, errorCount: 0 });
    expect(jobs.completed).toEqual([100]);
  });

  it('stejný otisk a aktivní → žádné volání Etsy', async () => {
    const { calls, client } = fakeClient();
    const first = deps(item(), fakeClient().client);
    await processJob(job(), first.d);
    const hash = first.saved.at(-1)!.syncedHash as string;
    const { d } = deps(item({ listing: { listingId: BigInt(555), state: 'active', syncedHash: hash, imageIds: [BigInt(1)], inactiveSince: null } }), client);
    await processJob(job(), d);
    expect(calls).toEqual([]);
  });

  it('jen změna ceny → aktualizace textů/ceny bez nahrávání fotek', async () => {
    const first = deps(item(), fakeClient().client);
    await processJob(job(), first.d);
    const hash = first.saved.at(-1)!.syncedHash as string;
    const { calls, client } = fakeClient();
    const { d } = deps(item({ finalCzk: '2000', listing: { listingId: BigInt(555), state: 'active', syncedHash: hash, imageIds: [BigInt(1)], inactiveSince: null } }), client);
    await processJob(job(), d);
    expect(calls).toEqual(['updateListing:"content"', 'updateInventory']);
  });

  it('rezervace e-shopu → stáhnout (inactive)', async () => {
    const { calls, client } = fakeClient();
    const { d, saved } = deps(item({ activeReservation: true, listing: { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null } }), client);
    await processJob(job({ kind: 'deactivate' }), d);
    expect(calls).toEqual(['updateListing:"inactive"']);
    expect(saved.at(-1)).toMatchObject({ state: 'inactive', blockedReason: 'reservation' });
  });

  it('429 dvakrát → runAfter +10 s a +30 s', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(429, 'slow', true));
    const snap = item({ sold: true, listing: { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null } });
    const a = deps(snap, client); await processJob(job({ attempts: 0 }), a.d);
    const b = deps(snap, client); await processJob(job({ attempts: 1 }), b.d);
    const now = new Date('2026-12-01T12:00:00Z').getTime();
    expect(a.jobs.failed[0].runAfter.getTime() - now).toBe(RETRY_DELAYS_MS[0]);
    expect(b.jobs.failed[0].runAfter.getTime() - now).toBe(RETRY_DELAYS_MS[1]);
    expect(RETRY_DELAYS_MS.slice(0, 2)).toEqual([10_000, 30_000]);
  });

  it('stažení potřetí neúspěšné → upozornění', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(503, 'down', true));
    const { d } = deps(item({ activeReservation: true, listing: { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null } }), client);
    await processJob(job({ kind: 'deactivate', attempts: 2 }), d);
    expect(d.alert).toHaveBeenCalledWith('deactivate_failing', expect.objectContaining({ catalogNumber: 'K0001-0001' }));
  });

  it('klient null (nepřipojeno) → nic se nemění, job zůstává', async () => {
    const { d, saved, jobs } = deps(item(), null);
    await processJob(job(), d);
    expect(saved).toEqual([]);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed).toEqual([]);
  });

  it('chybí profil dopravy → chyba bez volání Etsy', async () => {
    const { calls, client } = fakeClient();
    const { d, saved, jobs } = deps(item(), client, { loadContext: async () => ({ ...ctx, settings: { ...ctx.settings, shippingProfileId: null } }) });
    await processJob(job(), d);
    expect(calls).toEqual([]);
    expect(saved.at(-1)).toMatchObject({ state: 'error' });
    expect(String(saved.at(-1)!.lastError)).toContain('Administraci');
    expect(jobs.completed).toEqual([100]);
  });

  it('listing na Etsy zmizel (404 při stažení) → listingId null, hotovo', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(404, 'not found', false));
    const { d, saved, jobs } = deps(item({ sold: true, listing: { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null } }), client);
    await processJob(job(), d);
    expect(saved.at(-1)).toMatchObject({ listingId: null, state: 'none' });
    expect(jobs.completed).toEqual([100]);
  });
});

describe('sweep a reconcile', () => {
  it('sweep: aktivní kámen s jiným otiskem → job sync', async () => {
    const { d, jobs } = deps(null, null);
    await sweepWith([item({ listing: { listingId: BigInt(555), state: 'active', syncedHash: 'stary', imageIds: [], inactiveSince: null } })], d);
    expect(jobs.enqueued).toEqual([{ itemId: 1, reason: 'drift' }]);
  });
  it('reconcile: 404 na Etsy → listingId null + sync', async () => {
    const { client } = fakeClient();
    client.getListing.mockRejectedValue(new EtsyApiError(404, 'gone', false));
    const { d, saved, jobs } = deps(null, client);
    await reconcileWith([item({ listing: { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null } })], d);
    expect(saved.at(-1)).toMatchObject({ listingId: null, state: 'none' });
    expect(jobs.enqueued).toEqual([{ itemId: 1, reason: 'reconcile' }]);
  });
  it('reconcile: prodaný kámen, na Etsy active → sync; na Etsy inactive → nic', async () => {
    const sold = item({ sold: true, listing: { listingId: BigInt(555), state: 'inactive', syncedHash: 'x', imageIds: [], inactiveSince: new Date('2026-11-30') } });
    const a = fakeClient(); a.client.getListing.mockResolvedValue({ listing_id: 555, state: 'active', quantity: 1 });
    const da = deps(null, a.client); await reconcileWith([sold], da.d);
    expect(da.jobs.enqueued).toEqual([{ itemId: 1, reason: 'reconcile' }]);
    const b = fakeClient(); b.client.getListing.mockResolvedValue({ listing_id: 555, state: 'inactive', quantity: 1 });
    const db = deps(null, b.client); await reconcileWith([sold], db.d);
    expect(db.jobs.enqueued).toEqual([]);
  });
});

describe('opravy po kontrole (worker)', () => {
  const active = { listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null, alertedAt: null as Date | null };
  it('I5: obnova přístupu dočasně selže (výjimka z clientFactory) → retry s attempts+1, ne tiché čekání', async () => {
    const { d, jobs } = deps(item({ activeReservation: true, listing: active }), null, { clientFactory: async () => { throw new EtsyApiError(503, 'token', true); } });
    await processJob(job({ kind: 'deactivate', attempts: 0 }), d);
    expect(jobs.failed).toHaveLength(1);
    expect(jobs.failed[0].attempts).toBe(1);
  });
  it('I1: upozornění jen jednou na kámen (alertedAt) — další neúspěch už e-mail nepošle', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(503, 'down', true));
    const { d } = deps(item({ activeReservation: true, listing: { ...active, alertedAt: new Date() } }), client);
    await processJob(job({ kind: 'sync', attempts: 5 }), d);
    expect(d.alert).not.toHaveBeenCalled();
  });
  it('I1: první dosažení 3 pokusů → upozornění + uložení alertedAt', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(503, 'down', true));
    const { d, saved } = deps(item({ activeReservation: true, listing: active }), client);
    await processJob(job({ kind: 'sync', attempts: 2 }), d);
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(saved.some((p) => p.alertedAt instanceof Date)).toBe(true);
  });
  it('I5b: trvalá chyba (400) při stahování → upozornění hned', async () => {
    const { client } = fakeClient();
    client.updateListing.mockRejectedValue(new EtsyApiError(400, 'bad', false));
    const { d } = deps(item({ sold: true, listing: active }), client);
    await processJob(job({ kind: 'deactivate' }), d);
    expect(d.alert).toHaveBeenCalledWith('deactivate_failing', expect.objectContaining({ catalogNumber: 'K0001-0001' }));
  });
  it('I6: prodáno na Etsy → listing je sold_out, nic se na Etsy nevolá', async () => {
    const { calls, client } = fakeClient();
    const { d, saved } = deps(item({ sold: true, soldChannel: 'etsy', listing: active }), client);
    await processJob(job({ kind: 'deactivate' }), d);
    expect(calls).toEqual([]);
    expect(saved.at(-1)).toMatchObject({ state: 'sold_out', blockedReason: 'sold' });
  });
  it('I6: sold_out se bere jako stažený (sweep ani reconcile nic nedělají)', async () => {
    const sold = item({ sold: true, soldChannel: 'etsy', listing: { ...active, state: 'sold_out', inactiveSince: new Date('2026-11-30') } });
    const a = deps(null, null); await sweepWith([sold], a.d);
    expect(a.jobs.enqueued).toEqual([]);
    const c = fakeClient(); c.client.getListing.mockResolvedValue({ listing_id: 555, state: 'sold_out', quantity: 0 });
    const b = deps(null, c.client); await reconcileWith([sold], b.d);
    expect(b.jobs.enqueued).toEqual([]);
  });
});

describe('odložené drobnosti (worker)', () => {
  const l = (over: object) => ({ listingId: BigInt(555), state: 'active', syncedHash: 'x', imageIds: [], inactiveSince: null, alertedAt: null, ...over });
  it('M2: kámen prodaný na Etsy a pak ručně vrácený do prodeje → sold_out listing smazat a založit nový', async () => {
    const { calls, client } = fakeClient();
    const { d, saved } = deps(item({ listing: l({ state: 'sold_out' }) }), client);
    await processJob(job(), d);
    expect(calls[0]).toBe('deleteListing');
    expect(calls).toContain('createDraftListing');
    expect(calls.at(-1)).toBe('updateListing:"active"');
    expect(saved.at(-1)).toMatchObject({ state: 'active', listingId: BigInt(555) });
  });
  it('M5: předchozí vytvoření skončilo bez odpovědi (state creating) → převzít koncept se stejným názvem, nezakládat druhý', async () => {
    const { calls, client } = fakeClient();
    client.getDraftListings.mockResolvedValue([{ listing_id: 777, title: 'Moldavite', created_timestamp: Math.floor(new Date('2026-12-01T11:30:00Z').getTime() / 1000) }]);
    const { d, saved } = deps(item({ listing: l({ listingId: null, state: 'creating' }) }), client);
    await processJob(job(), d);
    expect(calls).not.toContain('createDraftListing');
    expect(saved.at(-1)).toMatchObject({ listingId: BigInt(777), state: 'active' });
  });
  it('M5: před voláním createDraftListing se uloží stav creating', async () => {
    const { client } = fakeClient();
    const { d, saved } = deps(item(), client);
    await processJob(job(), d);
    expect(saved[0]).toMatchObject({ state: 'creating' });
  });
});
