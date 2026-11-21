/**
 * AI úprava e-shopových fotek jednoho kamene (21. 11. 2026).
 *
 * Postup: sloty pro e-shop (resolveShopSlots, max 4) → originál zmenšený na 1536 px → Gemini
 * (lib/ai/geminiImage.ts) → kontrola obrysu proti originálu (stoneImage.silhouetteScore) →
 * sjednocení celé sady (composeSet: stejné plátno, měřítko, bílá) → `<PHOTOS_PATH>/<photoPath>/ai/NN-<hash>.jpg`
 * → záznam v `Item.aiPhotos`. Originály se nikdy nemění.
 *
 * Sjednocení počítá s celou sadou kamene: když se upravuje jen část (ostatní sloty už AI verzi mají),
 * načtou se do composeSet i hotové AI fotky, aby měřítko sedělo — přepíše se ale jen to, co se upravovalo.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { editPhoto, IMAGE_MODEL } from '@/lib/ai/geminiImage';
import type { GeminiRetryOptions } from '@/lib/ai/geminiClient';
import { resolveShopSlots } from './shopSelection';
import { parseAiPhotos, AI_FILE_RE, type AiPhotos, type AiPhotoEntry } from './aiPhotos';
import { stoneMask, silhouetteScore, composeSet, SCORE_OK } from './stoneImage';

const photosRoot = () => path.resolve(process.env.PHOTOS_PATH || path.join(process.cwd(), '..', 'kameny', 'FOTO_MOLDAVITE'));
const webRoot = () => (process.env.PHOTOS_WEB_PATH ? path.resolve(process.env.PHOTOS_WEB_PATH) : '');
const SRC_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const SEND_PX = 1536;

/** Adresář kamene pod kořenem, nebo null (traversal / prázdná cesta). */
export function itemDir(root: string, photoPath: string): string | null {
  if (!root || !photoPath || photoPath.includes('..') || photoPath.includes('\0') || photoPath.includes('\\')) return null;
  const dir = path.resolve(root, photoPath);
  return dir.startsWith(root + path.sep) ? dir : null;
}

/** Zdrojový soubor slotu: originál (PHOTOS_PATH) má přednost před webovou kopií — AI dostane víc detailu. */
export function findSource(photoPath: string, slot: number): string | null {
  const nn = String(slot).padStart(2, '0');
  for (const root of [photosRoot(), webRoot()]) {
    const dir = itemDir(root, photoPath);
    if (!dir) continue;
    for (const ext of SRC_EXTS) {
      const f = path.join(dir, `${nn}.${ext}`);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

/** Existující sloty 1–24 v obou kořenech. */
export function availableSlots(photoPath: string): number[] {
  const out: number[] = [];
  for (let n = 1; n <= 24; n++) if (findSource(photoPath, n)) out.push(n);
  return out;
}

export interface SlotOutcome { slot: number; status: 'ok' | 'suspect' | 'failed' | 'skipped'; score?: number; error?: string }
export interface EnhanceOutcome {
  ok: boolean;
  catalogNumber: string;
  slots: SlotOutcome[];
  error?: string;
  quota?: boolean;
}

export async function enhanceItemPhotos(
  itemId: number,
  opts: { userId: number; overwrite: boolean; retry: GeminiRetryOptions; onProgress?: (note: string) => void; editImpl?: typeof editPhoto },
): Promise<EnhanceOutcome> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, evidNumber: true, photoPath: true, mainPhoto: true, shopPhotos: true, aiPhotos: true, box: { select: { code: true } } },
  });
  if (!item) return { ok: false, catalogNumber: `#${itemId}`, slots: [], error: 'Kámen nenalezen' };
  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const outDir = itemDir(photosRoot(), item.photoPath);
  if (!outDir) return { ok: false, catalogNumber, slots: [], error: 'Kámen nemá složku s fotkami' };

  const { slots } = resolveShopSlots(availableSlots(item.photoPath), item.mainPhoto, item.shopPhotos);
  if (!slots.length) return { ok: false, catalogNumber, slots: [], error: 'Kámen nemá fotky' };

  const existing = parseAiPhotos(item.aiPhotos);
  const todo = slots.filter((s) => opts.overwrite || !existing[String(s)] || existing[String(s)].status === 'rejected');
  if (!todo.length) return { ok: true, catalogNumber, slots: slots.map((slot) => ({ slot, status: 'skipped' as const })) };

  const edit = opts.editImpl ?? editPhoto;
  const results: SlotOutcome[] = [];
  const edited: { slot: number; image: Buffer; score: number }[] = [];
  let quota = false;

  // Po dvou souběžně — Pro model ~20 s na fotku; 4 fotky najednou zbytečně tlačí na limit
  for (let i = 0; i < todo.length; i += 2) {
    await Promise.all(todo.slice(i, i + 2).map(async (slot) => {
      const src = findSource(item.photoPath, slot);
      if (!src) { results.push({ slot, status: 'failed', error: 'zdrojová fotka zmizela' }); return; }
      try {
        const original = await sharp(src).rotate().resize(SEND_PX, SEND_PX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
        opts.onProgress?.(`fotka ${slot}: AI úprava…`);
        const r = await edit(original, opts.retry);
        if (!r.ok) { if (r.quota) quota = true; results.push({ slot, status: 'failed', error: r.error }); return; }
        const score = silhouetteScore(await stoneMask(original), await stoneMask(r.image));
        edited.push({ slot, image: r.image, score });
      } catch (err) {
        results.push({ slot, status: 'failed', error: err instanceof Error ? err.message : String(err) });
      }
    }));
  }

  if (edited.length) {
    opts.onProgress?.('sjednocuji sadu…');
    // Do sjednocení i hotové AI fotky ostatních slotů (kvůli společnému měřítku); ukládají se jen nové.
    const keep: Buffer[] = [];
    for (const s of slots) {
      const e = existing[String(s)];
      if (todo.includes(s) || !e || e.status === 'rejected') continue;
      const f = path.join(outDir, 'ai', e.file);
      if (fs.existsSync(f)) keep.push(fs.readFileSync(f));
    }
    const composed = await composeSet([...edited.map((e) => e.image), ...keep]);

    fs.mkdirSync(path.join(outDir, 'ai'), { recursive: true });
    const now = new Date().toISOString();
    const updates: AiPhotos = {};
    for (let i = 0; i < edited.length; i++) {
      const { slot, score } = edited[i];
      const buf = composed[i];
      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
      const file = `${String(slot).padStart(2, '0')}-${hash}.jpg`;
      const tmp = path.join(outDir, 'ai', `.${file}.tmp-${process.pid}`);
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, path.join(outDir, 'ai', file));
      const status: AiPhotoEntry['status'] = score >= SCORE_OK ? 'ok' : 'suspect';
      updates[String(slot)] = { file, status, score, model: IMAGE_MODEL, createdAt: now };
      results.push({ slot, status, score });
    }

    // Zápis do DB: načíst čerstvý stav (mezitím mohl člověk schvalovat jiné sloty) a sloučit
    const fresh = parseAiPhotos((await prisma.item.findUnique({ where: { id: itemId }, select: { aiPhotos: true } }))?.aiPhotos);
    const replaced = Object.keys(updates).map((k) => fresh[k]?.file).filter((f): f is string => !!f);
    await prisma.item.update({ where: { id: itemId }, data: { aiPhotos: { ...fresh, ...updates } as unknown as Prisma.InputJsonValue } });
    for (const f of replaced) removeAiFile(outDir, f);

    const ok = results.filter((r) => r.status === 'ok').length;
    const suspect = results.filter((r) => r.status === 'suspect').length;
    await logActivity(opts.userId, 'ai.photos', catalogNumber,
      `AI úprava fotek: ${ok} použito v e-shopu${suspect ? `, ${suspect} ke kontrole (obrys se liší od originálu)` : ''}` +
      `${results.some((r) => r.status === 'failed') ? `, ${results.filter((r) => r.status === 'failed').length} selhalo` : ''} · ${IMAGE_MODEL}`);
  }

  results.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
  const failed = results.filter((r) => r.status === 'failed');
  return {
    ok: failed.length < todo.length,
    catalogNumber,
    slots: results,
    quota,
    error: failed.length ? failed.map((f) => `foto ${f.slot}: ${f.error}`).join('; ') : undefined,
  };
}

/** Smaže soubor AI fotky — jen náš soubor (`NN-<hash>.jpg`) v podsložce `ai/` daného kamene. */
export function removeAiFile(dir: string, file: string): void {
  if (!AI_FILE_RE.test(file)) return;
  const f = path.join(dir, 'ai', file);
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (err) { console.error('[ai-photos] nelze smazat', f, err); }
}

/** Ruční rozhodnutí u AI fotky: schválit (jde do e-shopu) / zamítnout (e-shop dostane originál, soubor pryč). */
export async function decideAiPhoto(itemId: number, slot: number, action: 'approve' | 'reject', userId: number): Promise<{ ok: boolean; error?: string }> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { evidNumber: true, photoPath: true, aiPhotos: true, box: { select: { code: true } } } });
  if (!item) return { ok: false, error: 'Kámen nenalezen' };
  const ai = parseAiPhotos(item.aiPhotos);
  const e = ai[String(slot)];
  if (!e) return { ok: false, error: 'Tahle fotka nemá AI úpravu' };
  if (action === 'approve') ai[String(slot)] = { ...e, status: 'approved' };
  else {
    const dir = itemDir(photosRoot(), item.photoPath);
    if (dir) removeAiFile(dir, e.file);
    delete ai[String(slot)];
  }
  await prisma.item.update({ where: { id: itemId }, data: { aiPhotos: ai as unknown as Prisma.InputJsonValue } });
  await logActivity(userId, 'ai.photos', `${item.box.code}-${item.evidNumber}`,
    action === 'approve' ? `AI fotka ${slot} schválena pro e-shop (shoda obrysu ${e.score})` : `AI fotka ${slot} zahozena — e-shop dostane originál`);
  return { ok: true };
}
