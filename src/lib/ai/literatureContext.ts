/**
 * Odborný kontext pro AI generování popisů kamene z knih ve Vševěd → Zdroje
 * (Gideon 13. 10. 2026: „chci, aby s tím pracoval jako se zdroji, nic neoznačuju").
 *
 * Čisté funkce (bez DB): sestavení dotazu z atributů kamene a formátování
 * vytažených pasáží do bloku, který jde do promptu. Pasáže jsou PODKLAD —
 * prompt modelu výslovně zakazuje doslovné opisování a citace (autorská práva,
 * knihy nejsou volné dílo).
 */
import type { RetrievedChunk } from '@/lib/vseved/types';

export const CONTEXT_TAG = '{kontext}';
export const DEFAULT_TOP_K = 6;
/** Pasáže pod touto podobností (cosine) jsou šum — nevkládat. */
export const MIN_SIMILARITY = 0.45;
/** Horní mez znaků jedné pasáže v promptu (chunk může mít ~1 500 znaků). */
export const MAX_CHUNK_CHARS = 900;

export interface StoneForContext {
  location?: string | null;
  shapeCz?: string | null;
  shapeDescCz?: string | null;
  attrColor?: string[] | null;
  attrDamage?: string | null;
  attrCollectible?: boolean | null;
  weightGrams?: number | string | null;
}

/**
 * Dotaz pro vektorové vyhledávání: lokalita je nejsilnější signál (geologie,
 * vznik, charakter naleziště), pak tvar a barva. Bez lokality i tvaru vrací
 * obecný dotaz na vltavíny, aby se našly aspoň úvodní pasáže.
 */
export function buildLiteratureQuery(s: StoneForContext): string {
  const parts: string[] = ['vltavín moldavit'];
  if (s.location) parts.push(`naleziště ${s.location} — lokalita, geologie, vznik, charakter vltavínů z této lokality`);
  if (s.shapeCz) parts.push(`tvar ${s.shapeCz}${s.shapeDescCz ? ` (${s.shapeDescCz})` : ''} — morfologie, skulptace povrchu`);
  if (s.attrColor && s.attrColor.length) parts.push(`barva ${s.attrColor.join(', ')}`);
  if (s.attrDamage) parts.push(`stav povrchu ${s.attrDamage}`);
  if (s.attrCollectible) parts.push('sbírkový kus, sběratelská hodnota');
  const w = Number(s.weightGrams);
  if (Number.isFinite(w) && w > 0) parts.push(w >= 20 ? 'velký vltavín, velikost a vzácnost' : w < 3 ? 'drobný vltavín' : 'střední velikost');
  return parts.join('. ');
}

/** Vybere a ořízne pasáže: podobnost ≥ práh, max jedna za chunk, nejvýš topK. */
export function selectChunks(chunks: RetrievedChunk[], topK = DEFAULT_TOP_K): RetrievedChunk[] {
  return chunks
    .filter((c) => c.similarity >= MIN_SIMILARITY && c.text.trim().length > 0)
    .slice(0, topK)
    .map((c) => ({ ...c, text: truncate(c.text.trim(), MAX_CHUNK_CHARS) }));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}

/** Blok do promptu. Prázdné pasáže → prázdný řetězec (prompt zůstane jako dřív). */
export function formatLiteratureContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const passages = chunks
    .map((c, i) => `[${i + 1}] ${c.text}`)
    .join('\n\n');
  return [
    '=== ODBORNÝ KONTEXT Z LITERATURY (interní podklad) ===',
    'Následující úryvky pocházejí z odborných knih o vltavínech. Použij je jako FAKTICKÝ PODKLAD',
    'pro popis (lokalita, geologie, vznik, morfologie, barva, vzácnost). Pravidla:',
    '- fakta parafrázuj vlastními slovy; NIKDY neopisuj věty, souvětí ani charakteristická slovní spojení',
    '  (víc než 4 slova za sebou shodná s úryvkem = špatně), formuluj jinak než předloha,',
    '- necituj názvy knih, autory ani čísla stran, nepiš „podle literatury“,',
    '- použij jen to, co se týká tohoto konkrétního kamene; co nesedí, ignoruj,',
    '- když úryvky k tématu nic neříkají, piš jako bez nich.',
    '',
    passages,
    '=== KONEC KONTEXTU ===',
  ].join('\n');
}

/**
 * Vloží blok do promptu: na místo značky {kontext}, nebo (když šablona značku nemá)
 * před prompt — Gideon nechce šablony upravovat. Bez pasáží jen odstraní značku.
 */
export function injectContext(prompt: string, contextBlock: string): string {
  if (prompt.includes(CONTEXT_TAG)) return prompt.split(CONTEXT_TAG).join(contextBlock);
  if (!contextBlock) return prompt;
  return `${contextBlock}\n\n${prompt}`;
}

/** Od této délky shodného sledu slov je text podezřele blízko předloze (autorská práva). */
export const OVERLAP_WARN_WORDS = 8;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Nejdelší společný souvislý sled slov dvou textů (po normalizaci: malá písmena, bez interpunkce/HTML). */
export function longestCommonWordRun(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  let best = 0;
  let prev = new Array<number>(wb.length + 1).fill(0);
  for (let i = 1; i <= wa.length; i++) {
    const cur = new Array<number>(wb.length + 1).fill(0);
    for (let j = 1; j <= wb.length; j++) {
      if (wa[i - 1] === wb[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/** Max. shoda vygenerovaných textů s použitými pasážemi — pro varování „zkontroluj, přeformuluj". */
export function maxOverlapWithChunks(generated: string[], chunks: RetrievedChunk[]): number {
  let best = 0;
  for (const g of generated) {
    if (!g) continue;
    for (const c of chunks) best = Math.max(best, longestCommonWordRun(g, c.text));
  }
  return best;
}
