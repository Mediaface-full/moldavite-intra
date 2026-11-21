/**
 * AI úpravy fotek kamene pro e-shop — záznam v `Item.aiPhotos` (JSON).
 *
 * { "7": { file: "07-a1b2c3d4.jpg", status: "ok", score: 0.91, model: "gemini-3-pro-image", createdAt: "…" } }
 *
 * - Soubor leží v `<PHOTOS_PATH>/<photoPath>/ai/<file>`; originál se nikdy nepřepisuje.
 * - Název má otisk (hash) → každá nová úprava = nová URL. E-shop přebírá fotky podle URL
 *   (BM Media::existing), takže starou verzi znovu nestáhne a novou ano. Zároveň webová kopie
 *   (PHOTOS_WEB_PATH) nemůže vydávat zastaralý obrázek pod stejným jménem.
 * - status:
 *     ok       kontrola obrysu prošla → e-shop dostane AI verzi
 *     suspect  obrys se od originálu liší (AI mohla kámen překreslit) → e-shop dostane ORIGINÁL,
 *              dokud ji člověk neschválí
 *     approved člověk ji po kontrole schválil → e-shop dostane AI verzi
 *     rejected člověk ji zamítl → e-shop dostane originál (soubor se smaže)
 */

export type AiPhotoStatus = 'ok' | 'suspect' | 'approved' | 'rejected';
export interface AiPhotoEntry {
  file: string;
  status: AiPhotoStatus;
  /** shoda obrysu kamene s originálem 0–1 (lib/photos/stoneImage.ts silhouetteScore) */
  score: number;
  model: string;
  createdAt: string;
}
export type AiPhotos = Record<string, AiPhotoEntry>;

const STATUSES: AiPhotoStatus[] = ['ok', 'suspect', 'approved', 'rejected'];
/** Jméno souboru AI fotky: `NN-<8 hex>.jpg`. Nic jiného se z JSONu na disk nepustí. */
export const AI_FILE_RE = /^\d{2}-[0-9a-f]{8}\.jpg$/;

/** Bezpečné čtení JSONu z DB — neplatné položky se zahodí. */
export function parseAiPhotos(value: unknown): AiPhotos {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: AiPhotos = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const slot = Number(k);
    if (!Number.isInteger(slot) || slot < 1 || slot > 24 || !v || typeof v !== 'object') continue;
    const e = v as Partial<AiPhotoEntry>;
    if (typeof e.file !== 'string' || !AI_FILE_RE.test(e.file)) continue;
    if (!STATUSES.includes(e.status as AiPhotoStatus)) continue;
    out[String(slot)] = {
      file: e.file,
      status: e.status as AiPhotoStatus,
      score: typeof e.score === 'number' && Number.isFinite(e.score) ? e.score : 0,
      model: typeof e.model === 'string' ? e.model : '',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : '',
    };
  }
  return out;
}

/** Jde AI verze tohoto slotu do e-shopu? */
export function isAiUsable(entry: AiPhotoEntry | undefined): entry is AiPhotoEntry {
  return !!entry && (entry.status === 'ok' || entry.status === 'approved');
}

/** Relativní cesta (pod photoPath) fotky, kterou dostane e-shop pro daný slot. */
export function shopPhotoFile(slot: number, ai: AiPhotos): { rel: string; ai: boolean } {
  const e = ai[String(slot)];
  // .webp jako u originálů — /images ho vyrobí on-demand z .jpg (lib/imageFormats.ts)
  if (isAiUsable(e)) return { rel: `ai/${e.file.replace(/\.jpg$/, '.webp')}`, ai: true };
  return { rel: `${String(slot).padStart(2, '0')}.webp`, ai: false };
}
