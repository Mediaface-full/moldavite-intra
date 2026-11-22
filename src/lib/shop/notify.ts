/**
 * Upozornění intra → e-shop (kontrakt docs/SHOP-API.md „Upozornění intra → e-shop“, e-shop bm-catalog/Webhook.php):
 * POST SHOP_WEBHOOK_URL, tělo {"event":"items.changed","ids":[…]}, hlavička X-BM-Signature: sha256=<hex HMAC(body, SHOP_WEBHOOK_SECRET)>.
 * Fire-and-forget s timeoutem 3 s — chyba se jen zaloguje, pojistkou je 5min synchronizace e-shopu.
 */
import { createHmac } from 'crypto';

export function shopSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function notifyShopItemsChanged(ids: number[], fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = process.env.SHOP_WEBHOOK_URL;
  const secret = process.env.SHOP_WEBHOOK_SECRET;
  if (!url || !secret || ids.length === 0) return;
  const body = JSON.stringify({ event: 'items.changed', ids });
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bm-signature': shopSignature(body, secret) },
      body,
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) console.error(`[shop-notify] e-shop odpověděl HTTP ${res.status}`);
  } catch (err) {
    console.error('[shop-notify] upozornění e-shopu selhalo', err instanceof Error ? err.message : err);
  }
}
