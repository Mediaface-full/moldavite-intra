/**
 * POST /api/items/[id]/voice-parse
 *
 * Vstup: { text: string }  — surový přepis hlasu (Web Speech API z klienta)
 * Výstup: {
 *   suggestions: {
 *     pasShape?: string,
 *     attrDamage?: string,
 *     attrColor?: string[],
 *     location?: string,
 *     weight?: number,
 *     attrCollectible?: boolean,
 *   },
 *   extraNotes?: string,  // text co se nehodí do strukturovaných polí (návrh do description)
 *   unmatched?: string[], // labels co Gemini navrhl ale nejsou v aktuálním AttrOption seznamu
 * }
 *
 * Server načte aktuální seznam AttrOption per attrKey (zdroj pravdy), pošle
 * Gemini Flash s prompt + schema. AI vrátí JSON, my validujeme proti seznamu
 * (mismatch → unmatched + nevyplníme). Klient ukáže confirmation modal.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit — Gemini je placený. 30 voice-parse / hod / user (3× víc než AI text generování,
  // jeden přepis kamene typicky vyžaduje 1 voice-parse + případně 1 retry).
  const limit = checkRateLimit(`voice:${session.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Příliš mnoho hlasových přepisů. Zkus to za ${Math.ceil(limit.retryAfterSec / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key není nastaven' }, { status: 500 });
  }

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const text: string = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length < 2) {
    return NextResponse.json({ error: 'Prázdný nebo příliš krátký text' }, { status: 422 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'Text je příliš dlouhý (max 2000 znaků)' }, { status: 422 });
  }

  // Aktuální seznam aktivních AttrOption — zdroj pravdy pro fuzzy match
  const opts = await prisma.attrOption.findMany({
    where: { active: true, attrKey: { in: ['pasShape', 'attrDamage', 'attrColor', 'location'] } },
    select: { attrKey: true, value: true },
    orderBy: { sortOrder: 'asc' },
  });
  const byKey: Record<string, string[]> = { pasShape: [], attrDamage: [], attrColor: [], location: [] };
  for (const o of opts) {
    if (byKey[o.attrKey]) byKey[o.attrKey].push(o.value);
  }

  const prompt = buildPrompt(text, byKey);

  const geminiRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,    // nizka pro consistentni structured extract
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!geminiRes.ok) {
    const err = await geminiRes.text().catch(() => 'unknown');
    console.error('Gemini voice-parse error:', geminiRes.status, err);
    return NextResponse.json({ error: `Gemini ${geminiRes.status}` }, { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error('Gemini vratil neparsovatelny JSON:', rawText);
    return NextResponse.json({ error: 'AI nevrátila čistý JSON, zkus přeformulovat.' }, { status: 502 });
  }

  // Validace: každé navržené pole musí existovat v aktuálním AttrOption seznamu.
  // Co se nehodí → vlož do `unmatched` pro UI hint („zkus přidat do číselníku").
  const suggestions: Record<string, unknown> = {};
  const unmatched: string[] = [];

  const pasShape = typeof parsed.pasShape === 'string' ? parsed.pasShape.trim() : '';
  if (pasShape) {
    if (byKey.pasShape.includes(pasShape)) suggestions.pasShape = pasShape;
    else unmatched.push(`Tvar: „${pasShape}" (není v číselníku)`);
  }
  const attrDamage = typeof parsed.attrDamage === 'string' ? parsed.attrDamage.trim() : '';
  if (attrDamage) {
    if (byKey.attrDamage.includes(attrDamage)) suggestions.attrDamage = attrDamage;
    else unmatched.push(`Poškození: „${attrDamage}" (není v číselníku)`);
  }
  const location = typeof parsed.location === 'string' ? parsed.location.trim() : '';
  if (location) {
    if (byKey.location.includes(location)) suggestions.location = location;
    else unmatched.push(`Místo: „${location}" (není v číselníku)`);
  }
  if (Array.isArray(parsed.attrColor)) {
    const cleanColors = parsed.attrColor
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim())
      .filter(Boolean);
    const matched = cleanColors.filter((c) => byKey.attrColor.includes(c));
    const unmatchedColors = cleanColors.filter((c) => !byKey.attrColor.includes(c));
    if (matched.length > 0) suggestions.attrColor = matched;
    for (const u of unmatchedColors) unmatched.push(`Barva: „${u}" (není v číselníku)`);
  }
  if (typeof parsed.weight === 'number' && parsed.weight > 0 && parsed.weight < 10000) {
    suggestions.weight = Math.round(parsed.weight * 100) / 100; // 2 desetiny
  }
  if (typeof parsed.attrCollectible === 'boolean') {
    suggestions.attrCollectible = parsed.attrCollectible;
  }
  const extraNotes = typeof parsed.extraNotes === 'string' ? parsed.extraNotes.trim() : '';

  await logActivity(session.id, 'item.voice_parse', String(itemId), JSON.stringify({
    textLen: text.length,
    matched: Object.keys(suggestions),
    unmatchedCount: unmatched.length,
  }));

  return NextResponse.json({
    suggestions,
    extraNotes: extraNotes || undefined,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
    rawText: text,
  });
}

function buildPrompt(text: string, byKey: Record<string, string[]>): string {
  return `Z následujícího hlasového přepisu o moldavitu (vltavín) vyextrahuj strukturované atributy.
Vrať POUZE JSON podle schématu, žádný markdown ani komentáře.

Přepis: """${text}"""

POVOLENÉ HODNOTY (musíš vybrat z těchto, jinak null):
- pasShape (tvar, jeden): ${byKey.pasShape.map((v) => `"${v}"`).join(', ')}
- attrDamage (poškození, jedno): ${byKey.attrDamage.map((v) => `"${v}"`).join(', ')}
- location (místo nálezu, jedno): ${byKey.location.map((v) => `"${v}"`).join(', ')}
- attrColor (barvy, pole jedné nebo víc): ${byKey.attrColor.map((v) => `"${v}"`).join(', ')}

DALŠÍ POLE:
- weight: číslo v gramech (např. "tři čtyři gramy" → 3.4, "pět celých sedm" → 5.7), null pokud nezmíněno
- attrCollectible: boolean, true pokud řečník výslovně řekl „sbírkový" / „sbírkový kus" / „pro sbírku", jinak null
- extraNotes: string s textem, který se NEHODÍ do žádného z polí výše (např. komentáře o kvalitě, čistotě, vrstvě, leskuotech, popis tvaru detailněji než kategorie). Pokud nic takového není, null.

PRAVIDLA:
1. Fuzzy match na CZ slova — „zelenej" → "zelená", „bezpoškození" → "Bez poškození", „kapičkovitý" → "Kapka"
2. Pokud řečník zmíní hodnotu která NENÍ v povolených (např. místo „Praha"), vrať ji v daném poli jak ji řekl — server ji odfiltruje a navrhne přidat do číselníku
3. Pro weight: čísla v češtině („tři" → 3, „celá" / „čárka" → desetinná čárka, „dvacet pět" → 25). Zaokrouhli na 2 desetiny.
4. extraNotes by mělo být JEN to co AI nedostala do strukturovaných polí — nikdy nezopakuj barvu/tvar/váhu znovu v extraNotes
5. Pokud řečník zmíní něco co je v žádném z polí (např. „velmi kvalitní kus"), patří to do extraNotes

VRAŤ JSON:
{
  "pasShape": "..." | null,
  "attrDamage": "..." | null,
  "location": "..." | null,
  "attrColor": ["...", "..."] | null,
  "weight": number | null,
  "attrCollectible": true | false | null,
  "extraNotes": "..." | null
}`;
}
