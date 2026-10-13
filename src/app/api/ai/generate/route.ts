import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';
import { checkRateLimit } from '@/lib/rateLimit';
import { retrieveChunks } from '@/lib/vseved/retrieve';
import {
  buildLiteratureQuery, selectChunks, formatLiteratureContext, injectContext, maxOverlapWithChunks,
  DEFAULT_TOP_K, OVERLAP_WARN_WORDS,
} from '@/lib/ai/literatureContext';
import type { RetrievedChunk } from '@/lib/vseved/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit per-admin — Gemini API je placený, bez limitu může jeden uživatel
  // vyfakturovat Gideona. 20 generací / hod / admin je dost pro normální workflow.
  const limit = checkRateLimit(`ai:${session.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Příliš mnoho AI generací. Zkus to za ${Math.ceil(limit.retryAfterSec / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  const body = await request.json();
  const itemId = Number(body?.itemId);
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  if (!Number.isInteger(itemId) || itemId <= 0 || !prompt) {
    return NextResponse.json({ error: 'Invalid itemId nebo prompt' }, { status: 422 });
  }

  // Get item data
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { box: true },
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const shape = getPasShape(item.pasShape);

  // Replace tags in prompt
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
  // bez označování. Bez zdrojů se embedding nevolá a prompt zůstává jako dřív; chyba
  // vyhledávání generování neshodí (jen bez kontextu).
  let literature: { used: number; titles: string[]; maxOverlapWords: number; overlapWarning: boolean } =
    { used: 0, titles: [], maxOverlapWords: 0, overlapWarning: false };
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

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptWithContext }],
        }],
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
      return NextResponse.json({ error: `Gemini API error: ${geminiRes.status}` }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (may be wrapped in ```json ... ```)
    let parsed;
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawText;
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON parsing fails, return raw text
      return NextResponse.json({
        success: false,
        rawText,
        error: 'Nepodařilo se parsovat JSON z odpovědi',
      });
    }

    // Escape HTML to prevent XSS from AI-returned content (Gemini can return <script>…).
    const esc = (s: unknown): string =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildHtml = (desc: string, bullets: string[] | string) => {
      let html = `<p>${esc(desc)}</p>`;
      if (bullets) {
        const bulletArr = Array.isArray(bullets) ? bullets : [bullets];
        if (bulletArr.length > 0) {
          html += '<ul>';
          for (const b of bulletArr) {
            html += `<li>${esc(b)}</li>`;
          }
          html += '</ul>';
        }
      }
      return html;
    };

    const result = {
      name_cz: parsed.name_cz || parsed.nazev_cz || '',
      name_en: parsed.name_en || parsed.nazev_en || '',
      desc_cz: parsed.desc_cz || parsed.popis_cz || '',
      desc_en: parsed.desc_en || parsed.popis_en || '',
      long_desc_cz: buildHtml(parsed.desc_cz || parsed.popis_cz || '', parsed.bullets_cz || parsed.vyhody_cz || []),
      long_desc_en: buildHtml(parsed.desc_en || parsed.popis_en || '', parsed.bullets_en || parsed.vyhody_en || []),
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

    await logActivity(session.id, 'ai.generate', catalogNumber, `AI generování pro ${catalogNumber}${literature.used ? ` · ${literature.used} pasáží z literatury, max. shoda ${literature.maxOverlapWords} slov` : ''}`);

    return NextResponse.json({ success: true, result, literature });

  } catch (err) {
    console.error('[ai/generate] Gemini call failed', err);
    return NextResponse.json({ error: 'Gemini API call failed' }, { status: 500 });
  }
}

// Apply AI results to item
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const itemId = body.itemId;
  if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'itemId musí být kladné celé číslo' }, { status: 400 });
  }
  // Textová pole: jen string (nebo vynechané), délkový strop proti nesmyslným payloadům.
  const TEXT_FIELDS = ['name', 'nameEn', 'description', 'descriptionEn', 'longDescription', 'longDescriptionEn'] as const;
  const MAX_LEN: Record<(typeof TEXT_FIELDS)[number], number> = {
    name: 200, nameEn: 200, description: 5000, descriptionEn: 5000, longDescription: 50000, longDescriptionEn: 50000,
  };
  const data: Record<string, string> = {};
  for (const f of TEXT_FIELDS) {
    const v = body[f];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > MAX_LEN[f]) {
      return NextResponse.json({ error: `${f} musí být string (max ${MAX_LEN[f]} znaků)` }, { status: 400 });
    }
    data[f] = v;
  }

  const exists = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.item.update({ where: { id: itemId }, data });

  await logActivity(session.id, 'ai.apply', `${itemId}`, 'AI texty aplikovány');

  return NextResponse.json({ success: true });
}
