/** Validace vstupů Shop API v1 (čisté funkce — testy v lib/shop/__tests__). */

export const REF_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
export const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9._/-]{1,60}$/;
export const RESERVATION_ID_PATTERN = /^[a-z0-9]{20,40}$/;

export type Invalid = { invalid: string };

export function positiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

export function parseReservationBody(body: unknown): { itemId: number; ref: string; ttlSeconds: number } | Invalid {
  if (!body || typeof body !== 'object') return { invalid: 'body' };
  const b = body as Record<string, unknown>;
  const itemId = positiveInt(b.itemId);
  if (!itemId) return { invalid: 'itemId' };
  if (typeof b.ref !== 'string' || !REF_PATTERN.test(b.ref)) return { invalid: 'ref' };
  const ttl = b.ttlSeconds === undefined ? 1800 : positiveInt(b.ttlSeconds);
  if (!ttl) return { invalid: 'ttlSeconds' };
  return { itemId, ref: b.ref, ttlSeconds: ttl };
}

export function parseSoldBody(body: unknown): { itemId: number; orderNumber: string; paidAt?: Date; details: string } | Invalid {
  if (!body || typeof body !== 'object') return { invalid: 'body' };
  const b = body as Record<string, unknown>;
  const itemId = positiveInt(b.itemId);
  if (!itemId) return { invalid: 'itemId' };
  if (typeof b.orderNumber !== 'string' || !ORDER_NUMBER_PATTERN.test(b.orderNumber)) return { invalid: 'orderNumber' };
  let paidAt: Date | undefined;
  if (b.paidAt !== undefined) {
    const d = new Date(String(b.paidAt));
    if (Number.isNaN(d.getTime())) return { invalid: 'paidAt' };
    paidAt = d;
  }
  // Informativní údaje do auditu (cena v e-shopu) — jen čísla / kód měny, nic jiného.
  const priceCzk = typeof b.priceCzk === 'number' && Number.isFinite(b.priceCzk) ? b.priceCzk : null;
  const currency = typeof b.currency === 'string' && /^[A-Z]{3}$/.test(b.currency) ? b.currency : null;
  const priceInCurrency = typeof b.priceInCurrency === 'number' && Number.isFinite(b.priceInCurrency) ? b.priceInCurrency : null;
  const details = JSON.stringify({ orderNumber: b.orderNumber, priceCzk, currency, priceInCurrency });
  return { itemId, orderNumber: b.orderNumber, paidAt, details };
}

/** request.json() s limitem velikosti (64 KB) — Shop API nikdy nic většího neposílá. */
export async function readJson(request: Request, maxBytes = 65_536): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
