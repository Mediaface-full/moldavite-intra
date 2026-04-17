import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { getPasShape } from '@/lib/pasShapes';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  const { itemId, prompt } = await request.json();

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

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: filledPrompt }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
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

    await logActivity(session.id, 'ai.generate', catalogNumber, `AI generování pro ${catalogNumber}`);

    return NextResponse.json({ success: true, result });

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

  const { itemId, name, nameEn, description, descriptionEn, longDescription, longDescriptionEn } = await request.json();

  await prisma.item.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && { name }),
      ...(nameEn !== undefined && { nameEn }),
      ...(description !== undefined && { description }),
      ...(descriptionEn !== undefined && { descriptionEn }),
      ...(longDescription !== undefined && { longDescription }),
      ...(longDescriptionEn !== undefined && { longDescriptionEn }),
    },
  });

  await logActivity(session.id, 'ai.apply', `${itemId}`, 'AI texty aplikovány');

  return NextResponse.json({ success: true });
}
