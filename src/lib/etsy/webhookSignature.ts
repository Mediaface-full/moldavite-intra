/**
 * Ověření podpisu Etsy webhooku (developers.etsy.com/documentation/essentials/webhooks, 21. 11. 2026):
 * signed content = webhook-id + "." + webhook-timestamp + "." + raw body; klíč = base64-decode secretu
 * bez prefixu "whsec_"; HMAC-SHA256, base64. Hlavička může nést víc podpisů ("v1,<sig> v1,<sig>").
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const WEBHOOK_TOLERANCE_SEC = 300;

export function verifyEtsyWebhook(input: {
  id: string | null; timestamp: string | null; signature: string | null; rawBody: string; secret: string; nowSec?: number;
}): { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'bad_signature' } {
  const { id, timestamp, signature, rawBody, secret } = input;
  if (!id || !timestamp || !signature || !secret) return { ok: false, reason: 'missing' };
  const ts = Number(timestamp);
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_SEC) return { ok: false, reason: 'stale' };

  const keyB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const expected = createHmac('sha256', Buffer.from(keyB64, 'base64')).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const part of signature.split(' ')) {
    const sig = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
    const got = Buffer.from(sig, 'base64');
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}
