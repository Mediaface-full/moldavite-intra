/**
 * Generování textů jednoho kamene přes Gemini — sdílené jádro pro
 * `POST /api/ai/generate` (modal, jednotlivě) a `lib/ai/bulkJobs.ts` (hromadně na kazetě).
 *
 * Kroky: doplnění značek do promptu → odborný kontext z knih ve Vševěd → Zdroje
 * (`literatureContext`) → Gemini (JSON mód) → sanitizace HTML → hlídač opisování.
 * Server-only (Prisma, API klíč).
 */
import { prisma } from '@/lib/prisma';
import { getPasShape } from '@/lib/pasShapes';
import { retrieveChunks } from '@/lib/vseved/retrieve';
import type { RetrievedChunk } from '@/lib/vseved/types';
import {
  buildLiteratureQuery, selectChunks, formatLiteratureContext, injectContext, maxOverlapWithChunks,
  DEFAULT_TOP_K, OVERLAP_WARN_WORDS,
} from './literatureContext';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export function geminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

export interface GeneratedTexts {
  name_cz: string;
  name_en: string;
  desc_cz: string;
  desc_en: string;
  long_desc_cz: string;
  long_desc_en: string;
  catalogNumber: string;
}

export interface LiteratureInfo {
  used: number;
  titles: string[];
  maxOverlapWords: number;
  overlapWarning: boolean;
}

export type GenerateOutcome =
  | { ok: true; result: GeneratedTexts; literature: LiteratureInfo; catalogNumber: string }
  | { ok: false; status: number; error: string; rawText?: string; catalogNumber?: string };

// Escape HTML to prevent XSS from AI-returned content (Gemini can return <script>…).
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function buildHtml(desc: string, bullets: string[] | string): string {
  let html = `<p>${esc(desc)}</p>`;
  if (bullets) {
    const bulletArr = Array.isArray(bullets) ? bullets : [bullets];
    if (bulletArr.length > 0) {
      html += '<ul>';
      for (const b of bulletArr) html += `<li>${esc(b)}</li>`;
      html += '</ul>';
    }
  }
  return html;
}

export async function generateTextsForItem(itemId: number, prompt: string): Promise<GenerateOutcome> {
  if (!geminiConfigured()) return { ok: false, status: 500, error: 'Gemini API key not configured' };

  const item = await prisma.item.findUnique({ where: { id: itemId }, include: { box: true } });
  if (!item) return { ok: false, status: 404, error: 'Item not found' };

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const shape = getPasShape(item.pasShape);

  const filledPrompt = prompt
    .replace(/\{hmotnost\}/g, `${item.weight}g`)
    .replace(/\{misto_nalezu\}/g, item.location || 'Česká republika')
    .replace(/\{katalogove_cislo\}/g, catalogNumber)
    .replace(/\{cena_czk\}/g, `${item.salePrice} CZK`)
    .replace(/\{cena_eur\}/g, `${item.priceEUR} EUR`)
    .replace(/\{cena_usd\}/g, `${item.priceUSD} USD`)
    .replace(/\{tvar_cz\}/g, shape?.cz || 'neurčeno')
    .replace(/\{tvar_en\}/g, shape?.en || 'undetermined')
    .replace(/\{tvar_popis_cz\}/g, shape?.descCz || '')
    .replace(/\{tvar_popis_en\}/g, shape?.descEn || '');

  // Odborný kontext z knih ve Vševěd → Zdroje (Gideon 13. 10. 2026): všechny READY zdroje,
  // bez označování. Bez zdrojů se embedding nevolá; chyba vyhledávání generování neshodí.
  let literature: LiteratureInfo = { used: 0, titles: [], maxOverlapWords: 0, overlapWarning: false };
  let usedChunks: RetrievedChunk[] = [];
  let promptWithContext = injectContext(filledPrompt, '');
  try {
    const readyDocs = await prisma.vsevedDocument.count({ where: { status: 'READY' } });
    if (readyDocs > 0) {
      const query = buildLiteratureQuery({
        location: item.location, shapeCz: shape?.cz, shapeDescCz: shape?.descCz,
        attrColor: item.attrColor, attrDamage: item.attrDamage, attrCollectible: item.attrCollectible,
        weightGrams: item.weight?.toString(),
      });
      usedChunks = selectChunks(await retrieveChunks(query, DEFAULT_TOP_K * 2), DEFAULT_TOP_K);
      promptWithContext = injectContext(filledPrompt, formatLiteratureContext(usedChunks));
      literature = { ...literature, used: usedChunks.length, titles: [...new Set(usedChunks.map((c) => c.documentTitle))] };
    }
  } catch (err) {
    console.error('[ai/generate] kontext z literatury selhal, generuji bez něj:', err);
  }

  let rawText = '';
  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptWithContext }] }],
        generationConfig: {
          temperature: 0.7,
          // 2.5-flash počítá do limitu i „thinking" tokeny — s 2048 odpověď občas končila
          // v půlce JSONu (13. 10. 2026: 2 ze 3 pokusů). JSON mód = bez ```json plotů a prózy.
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[ai/generate] Gemini API error', geminiRes.status, err);
      return { ok: false, status: 502, error: `Gemini API error: ${geminiRes.status}`, catalogNumber };
    }
    const geminiData = await geminiRes.json();
    rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (err) {
    console.error('[ai/generate] Gemini call failed', err);
    return { ok: false, status: 500, error: 'Gemini API call failed', catalogNumber };
  }

  // Parse JSON (JSON mód vrací čistý JSON; fallback na ```json … ``` kdyby ne)
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawText;
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, status: 200, error: 'Nepodařilo se parsovat JSON z odpovědi', rawText, catalogNumber };
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const descCz = str(parsed.desc_cz || parsed.popis_cz);
  const descEn = str(parsed.desc_en || parsed.popis_en);
  const result: GeneratedTexts = {
    name_cz: str(parsed.name_cz || parsed.nazev_cz),
    name_en: str(parsed.name_en || parsed.nazev_en),
    desc_cz: descCz,
    desc_en: descEn,
    long_desc_cz: buildHtml(descCz, (parsed.bullets_cz || parsed.vyhody_cz || []) as string[] | string),
    long_desc_en: buildHtml(descEn, (parsed.bullets_en || parsed.vyhody_en || []) as string[] | string),
    catalogNumber,
  };

  // Hlídač opisování: nejdelší shodný sled slov výstupu s použitými pasážemi (autorská práva knih).
  if (usedChunks.length) {
    const maxOverlapWords = maxOverlapWithChunks(
      [result.name_cz, result.name_en, result.desc_cz, result.desc_en, result.long_desc_cz, result.long_desc_en],
      usedChunks,
    );
    literature = { ...literature, maxOverlapWords, overlapWarning: maxOverlapWords >= OVERLAP_WARN_WORDS };
  }

  return { ok: true, result, literature, catalogNumber };
}

export function literatureLogSuffix(l: LiteratureInfo): string {
  return l.used ? ` · ${l.used} pasáží z literatury, max. shoda ${l.maxOverlapWords} slov` : '';
}
