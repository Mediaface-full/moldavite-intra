import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startEtsyScheduler, resetEtsySchedulerForTests, TICK_MS, type SchedulerDeps } from '@/lib/etsy/scheduler';

function harness(over: Partial<SchedulerDeps> = {}) {
  let tick: (() => void) | null = null;
  let now = new Date('2026-12-01T10:00:00Z').getTime(); // 11:00 Praha
  const d: SchedulerDeps = {
    processDueJobs: vi.fn(async () => ({ done: 0, failed: 0 })),
    reactivateExpired: vi.fn(async () => 0),
    poll: vi.fn(async () => 0),
    sweep: vi.fn(async () => 0),
    reconcile: vi.fn(async () => ({ checked: 0, fixed: 0 })),
    now: () => now,
    setIntervalImpl: vi.fn((fn: () => void) => { tick = fn; return 1 as unknown as ReturnType<typeof setInterval>; }) as unknown as typeof setInterval,
    ...over,
  };
  const advance = async (ms: number) => {
    for (let t = 0; t < ms; t += TICK_MS) { now += TICK_MS; tick!(); await new Promise((r) => setTimeout(r, 0)); }
  };
  return { d, advance, setNow: (iso: string) => { now = new Date(iso).getTime(); } };
}

beforeEach(() => resetEtsySchedulerForTests());

describe('plánovač Etsy', () => {
  it('druhé spuštění nezaloží druhý interval', () => {
    const { d } = harness();
    startEtsyScheduler(d);
    startEtsyScheduler(d);
    expect(d.setIntervalImpl).toHaveBeenCalledTimes(1);
  });
  it('běžící (pomalý) tik → další tik nic nevolá', async () => {
    const { d, advance } = harness({ processDueJobs: vi.fn(() => new Promise<{ done: number; failed: number }>(() => {})) });
    startEtsyScheduler(d);
    await advance(TICK_MS * 3);
    expect(d.processDueJobs).toHaveBeenCalledTimes(1);
  });
  it('za 3 min jednou polling, za 5 min jednou kontrola rozdílů, každou minutu vrácení po rezervaci', async () => {
    const { d, advance } = harness();
    startEtsyScheduler(d);
    await advance(3 * 60_000);
    expect(d.poll).toHaveBeenCalledTimes(1);
    expect(d.reactivateExpired).toHaveBeenCalledTimes(3);
    await advance(2 * 60_000);
    expect(d.sweep).toHaveBeenCalledTimes(1);
  });
  it('denní kontrola s Etsy jednou po 03:30 pražského času', async () => {
    const { d, advance, setNow } = harness();
    setNow('2026-12-02T02:20:00Z'); // 03:20 Praha (zimní čas, UTC+1)
    startEtsyScheduler(d);
    await advance(5 * 60_000);
    expect(d.reconcile).not.toHaveBeenCalled();
    await advance(10 * 60_000); // přes 03:30
    expect(d.reconcile).toHaveBeenCalledTimes(1);
    await advance(60 * 60_000);
    expect(d.reconcile).toHaveBeenCalledTimes(1);
  });
});
