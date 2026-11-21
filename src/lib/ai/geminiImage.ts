/**
 * AI úprava produktové fotky kamene přes Gemini (21. 11. 2026, Gideon: „AI fotku po fotce vylepší,
 * vyčistí, udělá ji marketingovější a hlavně sjednocené“).
 *
 * Model: `GEMINI_IMAGE_MODEL`, výchozí `gemini-3-pro-image` (2K výstup, 0,134 USD/fotka podle ceníku
 * ai.google.dev/gemini-api/docs/pricing k 21. 11. 2026). Test 21. 11. na K0005-0038:
 *  - gemini-3.1-flash-image (levnější) kámen viditelně překreslil (jiný tvar laloků) → nevhodné;
 *  - gemini-3-pro-image drží tvar i povrch, odstraní tmel a pozadí, ~20 s na fotku;
 *  - s VZOROVOU fotkou (pro sjednocení) model do profilu nakreslil kámen ze vzoru → vzor se NEPOSÍLÁ,
 *    sjednocení dělá jednotné zadání + lib/photos/stoneImage.ts composeSet.
 */
import { parseGeminiError, type GeminiRetryOptions } from './geminiClient';

export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
export const IMAGE_TIMEOUT_MS = 120_000;

export const PHOTO_PROMPT = `This is a product photo of a natural moldavite — a genuine, one-of-a-kind natural gemstone — for an e-shop.
Retouch it as a professional product photographer would:
- Keep the stone itself EXACTLY as it is: identical shape, outline, size in frame, surface texture and sculpture, transparency, color and every bump and edge. Do not add, remove, smooth, redraw or invent any part of the stone. The buyer must receive exactly what is pictured.
- Remove the mounting putty / support under the stone, dust, specks and lint.
- Replace the background with a clean, seamless, pure white studio background (#FFFFFF) with a soft, natural contact shadow directly under the stone.
- Even, neutral studio lighting; correct white balance so the green looks natural, not oversaturated.
- Keep the camera angle, the stone centered and the framing; square 1:1.
Return only the edited photo.`;

export type GeminiImageResult =
  | { ok: true; image: Buffer; mimeType: string }
  | { ok: false; status: number; quota: boolean; error: string };

export async function editPhoto(
  jpeg: Buffer,
  retry: GeminiRetryOptions,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<GeminiImageResult> {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key && fetchImpl === fetch) return { ok: false, status: 500, quota: false, error: 'Gemini API key not configured' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(IMAGE_MODEL)}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpeg.toString('base64') } }, { text: PHOTO_PROMPT }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '2K' } },
  });

  let last: GeminiImageResult = { ok: false, status: 500, quota: false, error: 'Gemini API call failed' };
  for (let attempt = 1; attempt <= Math.max(1, retry.attempts); attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      last = { ok: false, status: 500, quota: false, error: timedOut ? `Gemini neodpověděl do ${IMAGE_TIMEOUT_MS / 1000} s` : 'Gemini API call failed (síť)' };
      if (attempt < retry.attempts) { await sleep(5_000); continue; }
      return last;
    }
    if (res.ok) {
      const data = await res.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> } }> };
      const cand = data.candidates?.[0];
      const part = cand?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData) return { ok: true, image: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType };
      const text = cand?.content?.parts?.find((p) => p.text)?.text;
      return { ok: false, status: 502, quota: false, error: `Gemini nevrátil obrázek (${cand?.finishReason ?? 'bez důvodu'})${text ? `: ${text.slice(0, 160)}` : ''}` };
    }
    const bodyText = await res.text();
    const { reason, retryAfterSec } = parseGeminiError(res.status, bodyText, res.headers.get('retry-after'));
    const quota = res.status === 429;
    last = { ok: false, status: res.status, quota, error: `Gemini API error ${res.status}: ${reason}` };
    console.error(`[gemini-image] ${res.status} (pokus ${attempt}/${retry.attempts}): ${reason}`);
    if (quota && /PerDay/i.test(reason)) { last.error += ' — denní kvóta Gemini vyčerpána'; break; }
    if (!(res.status === 429 || res.status === 503 || res.status === 500) || attempt === retry.attempts) break;
    const waitMs = Math.min(retry.maxWaitMs, (retryAfterSec ?? 15 * attempt) * 1000);
    retry.onRetry?.({ attempt, attempts: retry.attempts, waitMs, status: res.status, reason });
    await sleep(waitMs);
  }
  return last;
}
