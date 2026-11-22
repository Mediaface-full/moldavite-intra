import { describe, it, expect, beforeEach, vi } from 'vitest';

const processDueJobs = vi.fn();
vi.mock('@/lib/etsy/worker', () => ({ processDueJobs }));
import { enqueueEtsyJob, kickEtsy } from '@/lib/etsy/queue';

function fakeDb() {
  const calls: { sql: string; vals: unknown[] }[] = [];
  const db = { $executeRaw: (strings: TemplateStringsArray, ...vals: unknown[]) => { calls.push({ sql: strings.join('?'), vals }); return Promise.resolve(1); } };
  return { calls, db };
}

beforeEach(() => {
  Object.assign(process.env, { ETSY_KEYSTRING: 'ks', ETSY_SHARED_SECRET: 's', ETSY_TOKEN_KEY: 'ab'.repeat(32) });
  processDueJobs.mockReset();
});

describe('enqueueEtsyJob', () => {
  it('upsert otevřeného jobu přes ON CONFLICT (jeden na kámen a druh)', async () => {
    const { calls, db } = fakeDb();
    await enqueueEtsyJob(db, 7, 'deactivate', 'reservation');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ON CONFLICT ("itemId", "kind") WHERE "doneAt" IS NULL');
    expect(calls[0].vals.slice(0, 3)).toEqual([7, 'deactivate', 'reservation']);
  });
  it('bez konfigurace Etsy nic nezapíše', async () => {
    delete process.env.ETSY_KEYSTRING;
    const { calls, db } = fakeDb();
    await enqueueEtsyJob(db, 7, 'sync', 'x');
    expect(calls).toHaveLength(0);
  });
});

describe('kickEtsy', () => {
  it('chyba workeru nevyhodí (rezervace e-shopu nesmí spadnout kvůli Etsy)', async () => {
    processDueJobs.mockRejectedValue(new Error('Etsy down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => kickEtsy([7])).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(processDueJobs).toHaveBeenCalledWith({ itemIds: [7] });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('opravy po kontrole (fronta)', () => {
  it('I1: opakované zařazení nenuluje pokusy; neurgentní neposouvá runAfter', async () => {
    const { calls, db } = fakeDb();
    await enqueueEtsyJob(db, 7, 'sync', 'drift', { urgent: false });
    expect(calls[0].sql).not.toContain('"attempts" = 0');
    expect(calls[0].sql).toContain('LEAST');
    expect(calls[0].vals).toEqual([7, 'sync', 'drift', false]);
  });
  it('výchozí zařazení je urgentní (rezervace, prodej)', async () => {
    const { calls, db } = fakeDb();
    await enqueueEtsyJob(db, 7, 'deactivate', 'reservation');
    expect(calls[0].vals).toEqual([7, 'deactivate', 'reservation', true]);
  });
});
