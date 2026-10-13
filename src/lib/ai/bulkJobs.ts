/**
 * Hromadné AI generování textů kamenů (Gideon 13. 10. 2026: „nebudu klikat po 20 kamenech").
 *
 * Job běží na pozadí v procesu Next.js (jeden kontejner na NASu), stav v paměti:
 * `POST /api/ai/bulk` ho spustí a vrátí jobId, `GET /api/ai/bulk/[jobId]` dává průběh,
 * tlačítko na kazetě se ptá každé ~2,5 s. Při restartu kontejneru se běžící job ztratí —
 * už uložené texty zůstávají, zbytek se pustí znovu (bez overwrite se hotové přeskočí).
 *
 * Bezpečnost: jen jeden běžící job najednou, max MAX_ITEMS kamenů, pauza mezi kameny.
 * Bez `overwrite` se plní jen prázdná pole (`pickFieldsToSave`).
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { generateTextsForItem, literatureLogSuffix } from './generateForItem';
import { RETRY_BULK } from './geminiClient';
import { AI_TEXT_FIELDS, pickFieldsToSave, type TextFields } from './bulkFields';

export const MAX_ITEMS = 300;
const ITEM_DELAY_MS = 800;
const KEEP_FINISHED = 20;

export interface BulkItemResult {
  itemId: number;
  catalogNumber: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
  /** selhání kvůli limitu Gemini (429) — po opakovaných se běh ukončí */
  quota?: boolean;
  savedFields?: string[];
  maxOverlapWords?: number;
  overlapWarning?: boolean;
}

export interface BulkJob {
  id: string;
  userId: number;
  boxCode: string;
  overwrite: boolean;
  total: number;
  done: number;
  ok: number;
  skipped: number;
  failed: number;
  warnings: number;
  running: boolean;
  cancelled: boolean;
  startedAt: string;
  finishedAt: string | null;
  error?: string;
  results: BulkItemResult[];
}

const jobs = new Map<string, BulkJob>();
let active: BulkJob | null = null;

export function getBulkJob(id: string): BulkJob | null {
  return jobs.get(id) ?? null;
}

export function getActiveBulkJob(): BulkJob | null {
  return active && active.running ? active : null;
}

export function cancelBulkJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !job.running) return false;
  job.cancelled = true;
  return true;
}

export function startBulkJob(opts: {
  userId: number; boxCode: string; itemIds: number[]; prompt: string; overwrite: boolean;
}): BulkJob {
  if (active?.running) throw new Error(`Už běží hromadné generování (kazeta ${active.boxCode}, ${active.done}/${active.total}). Počkej, až doběhne.`);
  if (opts.itemIds.length === 0) throw new Error('Žádné kameny ke generování');
  if (opts.itemIds.length > MAX_ITEMS) throw new Error(`Max ${MAX_ITEMS} kamenů na jeden běh`);

  const job: BulkJob = {
    id: randomUUID(), userId: opts.userId, boxCode: opts.boxCode, overwrite: opts.overwrite,
    total: opts.itemIds.length, done: 0, ok: 0, skipped: 0, failed: 0, warnings: 0,
    running: true, cancelled: false, startedAt: new Date().toISOString(), finishedAt: null, results: [],
  };
  jobs.set(job.id, job);
  active = job;

  void run(job, opts)
    .catch((err) => {
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[ai/bulk] job ${job.id} selhal:`, err);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      if (active === job) active = null;
      prune();
    });

  return job;
}

async function run(job: BulkJob, opts: { userId: number; itemIds: number[]; prompt: string; overwrite: boolean }): Promise<void> {
  let quotaStreak = 0;
  for (let i = 0; i < opts.itemIds.length; i++) {
    if (job.cancelled) break;
    const r = await processItem(job, opts.itemIds[i], opts);
    job.results.push(r);
    job.done++;
    if (r.status === 'ok') job.ok++;
    else if (r.status === 'skipped') job.skipped++;
    else job.failed++;
    if (r.overlapWarning) job.warnings++;
    // Limit Gemini (429) i po opakování: po dvou kamenech za sebou běh ukončit — další by
    // dopadly stejně (13. 10. 2026: 20× 429 v řadě na produkci). Zbytek zůstane bez textů.
    quotaStreak = r.status === 'failed' && r.quota ? quotaStreak + 1 : 0;
    if (quotaStreak >= 2) {
      const remaining = opts.itemIds.length - (i + 1);
      job.error = `Gemini odmítá kvůli limitu (429): ${r.error ?? ''} — běh ukončen, ${remaining} kamenů nezpracováno. Zkus později, nebo zkontroluj tarif Gemini účtu (AI Studio → Projects).`;
      job.cancelled = true;
      break;
    }
    await new Promise((res) => setTimeout(res, ITEM_DELAY_MS));
  }
  await logActivity(
    opts.userId, 'ai.generate_bulk', job.boxCode,
    `${job.ok} uloženo, ${job.skipped} přeskočeno, ${job.failed} selhalo` +
      (job.warnings ? `, ${job.warnings} k překontrolování (shoda s literaturou)` : '') +
      (job.cancelled ? ' · zrušeno' : '') + (job.overwrite ? ' · přepis' : ''),
  );
}

async function processItem(job: BulkJob, itemId: number, opts: { userId: number; prompt: string; overwrite: boolean }): Promise<BulkItemResult> {
  const outcome = await generateTextsForItem(itemId, opts.prompt, RETRY_BULK);
  if (!outcome.ok) {
    return { itemId, catalogNumber: outcome.catalogNumber ?? String(itemId), status: 'failed', error: outcome.error, quota: outcome.quota };
  }
  const { result, literature, catalogNumber } = outcome;
  const current = await prisma.item.findUnique({
    where: { id: itemId },
    select: { name: true, nameEn: true, description: true, descriptionEn: true, longDescription: true, longDescriptionEn: true },
  });
  if (!current) return { itemId, catalogNumber, status: 'failed', error: 'Kámen mezitím zmizel' };

  const generated: TextFields = {
    name: result.name_cz, nameEn: result.name_en, description: result.desc_cz, descriptionEn: result.desc_en,
    longDescription: result.long_desc_cz, longDescriptionEn: result.long_desc_en,
  };
  const data = pickFieldsToSave(current, generated, opts.overwrite);
  const savedFields = AI_TEXT_FIELDS.filter((f) => f in data);
  if (savedFields.length === 0) {
    return { itemId, catalogNumber, status: 'skipped', error: 'texty už vyplněné', maxOverlapWords: literature.maxOverlapWords, overlapWarning: literature.overlapWarning };
  }
  await prisma.item.update({ where: { id: itemId }, data });
  await logActivity(opts.userId, 'ai.generate', catalogNumber, `AI hromadně: uloženo ${savedFields.join(', ')}${literatureLogSuffix(literature)}`);
  return { itemId, catalogNumber, status: 'ok', savedFields, maxOverlapWords: literature.maxOverlapWords, overlapWarning: literature.overlapWarning };
}

function prune(): void {
  const finished = [...jobs.values()].filter((j) => !j.running).sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''));
  while (finished.length > KEEP_FINISHED) {
    const oldest = finished.shift();
    if (oldest) jobs.delete(oldest.id);
  }
}
