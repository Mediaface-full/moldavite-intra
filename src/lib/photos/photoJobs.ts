/**
 * AI úprava fotek na pozadí — jeden kámen i celá kazeta (stejný vzor jako lib/ai/bulkJobs.ts).
 * Stav v paměti procesu; restart kontejneru běh ztratí, hotové kameny zůstanou (bez „přepsat“ se přeskočí).
 * Jen jeden běh najednou (Pro model ~20 s/fotka, ať nesoupeří o limit Gemini).
 */
import { randomUUID } from 'node:crypto';
import { logActivity } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RETRY_BULK } from '@/lib/ai/geminiClient';
import { enhanceItemPhotos, type SlotOutcome } from './enhanceItem';

export const MAX_ITEMS = 1000; // celý sklad (Gideon 21. 11.: po kazetách „max po 20“)
const KEEP_FINISHED = 20;

export interface PhotoJobItem {
  itemId: number; catalogNumber: string;
  status: 'ok' | 'skipped' | 'failed';
  slots: SlotOutcome[]; error?: string;
}
export interface PhotoJob {
  id: string; userId: number; label: string; overwrite: boolean;
  total: number; done: number; photosOk: number; photosSuspect: number; failed: number;
  running: boolean; cancelled: boolean; startedAt: string; finishedAt: string | null; error?: string;
  current: { catalogNumber: string; note: string } | null;
  results: PhotoJobItem[];
}

const jobs = new Map<string, PhotoJob>();
let active: PhotoJob | null = null;

export const getPhotoJob = (id: string) => jobs.get(id) ?? null;
export const getActivePhotoJob = () => (active?.running ? active : null);
export function cancelPhotoJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j || !j.running) return false;
  j.cancelled = true;
  return true;
}

export function startPhotoJob(opts: { userId: number; label: string; itemIds: number[]; overwrite: boolean }): PhotoJob {
  if (active?.running) throw new Error(`Už běží AI úprava fotek (${active.label}, ${active.done}/${active.total}). Počkej, až doběhne.`);
  if (!opts.itemIds.length) throw new Error('Žádné kameny k úpravě');
  if (opts.itemIds.length > MAX_ITEMS) throw new Error(`Max ${MAX_ITEMS} kamenů na jeden běh`);
  const job: PhotoJob = {
    id: randomUUID(), userId: opts.userId, label: opts.label, overwrite: opts.overwrite,
    total: opts.itemIds.length, done: 0, photosOk: 0, photosSuspect: 0, failed: 0,
    running: true, cancelled: false, startedAt: new Date().toISOString(), finishedAt: null, current: null, results: [],
  };
  jobs.set(job.id, job);
  active = job;
  void run(job, opts.itemIds)
    .catch((err) => { job.error = err instanceof Error ? err.message : String(err); console.error(`[ai-photos] job ${job.id}`, err); })
    .finally(() => {
      job.running = false; job.current = null; job.finishedAt = new Date().toISOString();
      if (active === job) active = null;
      const finished = [...jobs.values()].filter((j) => !j.running).sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''));
      while (finished.length > KEEP_FINISHED) { const o = finished.shift(); if (o) jobs.delete(o.id); }
    });
  return job;
}

async function run(job: PhotoJob, itemIds: number[]) {
  let quotaStreak = 0;
  for (let i = 0; i < itemIds.length; i++) {
    if (job.cancelled) break;
    const id = itemIds[i];
    const head = await prisma.item.findUnique({ where: { id }, select: { evidNumber: true, box: { select: { code: true } } } });
    job.current = { catalogNumber: head ? `${head.box.code}-${head.evidNumber}` : `#${id}`, note: 'připravuji…' };
    const r = await enhanceItemPhotos(id, {
      userId: job.userId, overwrite: job.overwrite,
      retry: { ...RETRY_BULK, onRetry: (x) => { if (job.current) job.current.note = `čekám ${Math.round(x.waitMs / 1000)} s na limit Gemini (pokus ${x.attempt}/${x.attempts})`; } },
      onProgress: (note) => { job.current = { catalogNumber: job.current?.catalogNumber ?? `#${id}`, note }; },
    });
    job.current = { catalogNumber: r.catalogNumber, note: 'hotovo' };
    const ok = r.slots.filter((s) => s.status === 'ok').length;
    const suspect = r.slots.filter((s) => s.status === 'suspect').length;
    const allSkipped = r.slots.length > 0 && r.slots.every((s) => s.status === 'skipped');
    job.photosOk += ok; job.photosSuspect += suspect;
    const status: PhotoJobItem['status'] = !r.ok ? 'failed' : allSkipped ? 'skipped' : 'ok';
    if (status === 'failed') job.failed++;
    job.results.push({ itemId: id, catalogNumber: r.catalogNumber, status, slots: r.slots, error: r.error });
    job.done++;
    quotaStreak = r.quota && !ok && !suspect ? quotaStreak + 1 : 0;
    if (quotaStreak >= 2) {
      job.error = `Gemini odmítá kvůli limitu (429) — běh ukončen, ${itemIds.length - i - 1} kamenů nezpracováno. ${r.error ?? ''}`;
      job.cancelled = true;
      break;
    }
  }
  if (job.total > 1) {
    await logActivity(job.userId, 'ai.photos_bulk', job.label,
      `${job.photosOk} fotek do e-shopu, ${job.photosSuspect} ke kontrole, ${job.failed} kamenů selhalo${job.cancelled ? ' · zrušeno' : ''}${job.overwrite ? ' · přepis' : ''}`);
  }
}
