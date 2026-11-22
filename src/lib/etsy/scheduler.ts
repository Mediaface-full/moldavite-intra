/**
 * Plánovač napojení na Etsy (běží v procesu Next.js, spouští ho src/instrumentation.ts):
 *  - každých 20 s fronta EtsyJob (max 10 jobů),
 *  - každou minutu vrácení listingů po vypršené rezervaci e-shopu,
 *  - každé 3 min polling zaplacených objednávek (záloha za webhook),
 *  - každých 5 min kontrola rozdílů (texty, cena, fotky, kurz → job sync),
 *  - 1× denně po 03:30 pražského času kontrola stavu přímo na Etsy.
 * Jeden interval na proces; když předchozí tik ještě běží, další se přeskočí.
 */
export const TICK_MS = 20_000;
const REACTIVATE_MS = 60_000;
const POLL_MS = 180_000;
const SWEEP_MS = 300_000;
const RECONCILE_AT = '03:30';

export interface SchedulerDeps {
  processDueJobs: () => Promise<unknown>;
  reactivateExpired: () => Promise<number>;
  poll: () => Promise<number>;
  sweep: () => Promise<number>;
  reconcile: () => Promise<unknown>;
  now: () => number;
  setIntervalImpl: typeof setInterval;
}

type State = { started: boolean; timer: ReturnType<typeof setInterval> | null };
const g = globalThis as unknown as { __etsyScheduler?: State };

export function resetEtsySchedulerForTests() { g.__etsyScheduler = { started: false, timer: null }; }

function pragueDateTime(ms: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

export function startEtsyScheduler(deps: SchedulerDeps): () => void {
  const state = (g.__etsyScheduler ??= { started: false, timer: null });
  if (state.started) return () => {};
  state.started = true;

  const start = deps.now();
  let last = { reactivate: start, poll: start, sweep: start };
  let reconciledOn = pragueDateTime(start).time >= RECONCILE_AT ? pragueDateTime(start).date : '';
  let running = false;

  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (err) { console.error(`[etsy-scheduler] ${name} selhalo`, err instanceof Error ? err.message : err); }
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = deps.now();
      await step('fronta', deps.processDueJobs);
      if (now - last.reactivate >= REACTIVATE_MS) { last = { ...last, reactivate: now }; await step('vrácení po rezervaci', deps.reactivateExpired); }
      if (now - last.poll >= POLL_MS) { last = { ...last, poll: now }; await step('polling objednávek', deps.poll); }
      if (now - last.sweep >= SWEEP_MS) { last = { ...last, sweep: now }; await step('kontrola rozdílů', deps.sweep); }
      const p = pragueDateTime(now);
      if (p.time >= RECONCILE_AT && reconciledOn !== p.date) { reconciledOn = p.date; await step('denní kontrola', deps.reconcile); }
    } finally {
      running = false;
    }
  };

  state.timer = deps.setIntervalImpl(() => { void tick(); }, TICK_MS);
  return () => { if (state.timer) clearInterval(state.timer); state.started = false; state.timer = null; };
}

/** Výchozí závislosti napojené na DB a Etsy (dynamické importy — instrumentation se načítá i bez Etsy). */
export async function startDefaultEtsyScheduler(): Promise<void> {
  const [{ processDueJobs, sweepEtsyDrift, reconcileWithEtsy }, { pollEtsyReceipts }, { getEtsyClient }, { reactivateExpiredReservations }] = await Promise.all([
    import('./worker'), import('./orders'), import('./connection'), import('./reactivate'),
  ]);
  startEtsyScheduler({
    processDueJobs: () => processDueJobs({ limit: 10 }),
    reactivateExpired: reactivateExpiredReservations,
    poll: async () => { const c = await getEtsyClient(); return c ? pollEtsyReceipts(c) : 0; },
    sweep: sweepEtsyDrift,
    reconcile: reconcileWithEtsy,
    now: () => Date.now(),
    setIntervalImpl: setInterval,
  });
  console.log('[etsy-scheduler] spuštěn');
}
