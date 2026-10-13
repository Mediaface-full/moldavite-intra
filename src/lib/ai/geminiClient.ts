/**
 * Volání Gemini generateContent s retry na 429 (limit) a 503 (přetížení).
 *
 * 13. 10. 2026: hromadný běh na kazetě dostal 20× „Gemini API error: 429" za sebou — bez
 * čekání a bez důvodu. Teď: čeká podle `RetryInfo.retryDelay` / `Retry-After` (s horní mezí),
 * zkusí znovu, a chyba nese Googlem vrácený důvod (který limit, free tier …).
 * `fetchImpl` je injektovatelný kvůli testům.
 */
export interface GeminiRetryOptions {
  /** celkový počet pokusů (1 = bez retry) */
  attempts: number;
  /** horní mez čekání mezi pokusy v ms */
  maxWaitMs: number;
}

/** Modal (synchronní request, DSM proxy 60 s): krátce. Hromadný běh: trpělivě. */
export const RETRY_SINGLE: GeminiRetryOptions = { attempts: 2, maxWaitMs: 12_000 };
export const RETRY_BULK: GeminiRetryOptions = { attempts: 4, maxWaitMs: 65_000 };

export interface GeminiFailure {
  ok: false;
  status: number;
  /** 429 = limit/kvóta — hromadný běh po opakování končí, nemá smysl pálit další kameny */
  quota: boolean;
  error: string;
  retryAfterSec?: number;
}
export interface GeminiSuccess { ok: true; text: string }
export type GeminiResult = GeminiSuccess | GeminiFailure;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/** Z těla chyby vytáhne lidsky čitelný důvod a doporučené čekání (RetryInfo.retryDelay "37s"). */
export function parseGeminiError(status: number, bodyText: string, retryAfterHeader?: string | null): { reason: string; retryAfterSec?: number } {
  let reason = `HTTP ${status}`;
  let retryAfterSec: number | undefined;
  try {
    const body = JSON.parse(bodyText) as { error?: { message?: string; status?: string; details?: Array<Record<string, unknown>> } };
    const msg = body.error?.message?.trim();
    if (msg) reason = msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
    for (const d of body.error?.details ?? []) {
      const delay = d.retryDelay;
      if (typeof delay === 'string') {
        const s = Number(delay.replace(/s$/, ''));
        if (Number.isFinite(s) && s > 0) retryAfterSec = Math.ceil(s);
      }
      // QuotaFailure.violations[0].quotaId říká, KTERÝ limit (např. …PerMinute…-FreeTier) — vždy připojit.
      const violations = d.violations;
      if (Array.isArray(violations) && violations.length) {
        const v = violations[0] as { quotaId?: string; description?: string };
        const which = v.quotaId ?? v.description;
        if (which && !reason.includes(which)) reason += ` (${which})`;
      }
    }
  } catch {
    const t = bodyText.trim();
    if (t) reason = t.length > 220 ? `${t.slice(0, 220)}…` : t;
  }
  if (retryAfterSec === undefined && retryAfterHeader) {
    const s = Number(retryAfterHeader);
    if (Number.isFinite(s) && s > 0) retryAfterSec = Math.ceil(s);
  }
  return { reason, retryAfterSec };
}

export function geminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

export async function callGemini(
  prompt: string,
  retry: GeminiRetryOptions,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY && fetchImpl === fetch) return { ok: false, status: 500, quota: false, error: 'Gemini API key not configured' };

  let last: GeminiFailure | null = null;
  for (let attempt = 1; attempt <= Math.max(1, retry.attempts); attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            // 2.5-flash počítá do limitu i „thinking" tokeny — s 2048 odpověď občas končila
            // v půlce JSONu. JSON mód = bez ```json plotů a prózy.
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (err) {
      console.error('[gemini] call failed', err);
      return { ok: false, status: 500, quota: false, error: 'Gemini API call failed (síť)' };
    }

    if (res.ok) {
      const data = await res.json();
      return { ok: true, text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    }

    const bodyText = await res.text();
    const { reason, retryAfterSec } = parseGeminiError(res.status, bodyText, res.headers.get('retry-after'));
    const quota = res.status === 429;
    last = { ok: false, status: res.status, quota, error: `Gemini API error ${res.status}: ${reason}`, retryAfterSec };
    console.error(`[gemini] ${res.status} (pokus ${attempt}/${retry.attempts}): ${reason}`);

    const retryable = res.status === 429 || res.status === 503;
    if (!retryable || attempt === retry.attempts) break;
    const waitMs = Math.min(retry.maxWaitMs, (retryAfterSec ?? 15 * attempt) * 1000);
    await sleep(waitMs);
  }
  return last ?? { ok: false, status: 500, quota: false, error: 'Gemini API call failed' };
}
