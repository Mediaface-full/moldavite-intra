/**
 * POST /api/etsy/webhook — zprávy z Etsy (order.paid, order.canceled). Veřejné (výjimka v proxy.ts),
 * proto: rate limit, max 64 kB, podpis ETSY_WEBHOOK_SECRET, stáří ±5 min, idempotence podle webhook-id.
 * Obsah zprávy nese jen resource_url → číslo objednávky z něj a objednávku načteme sami (žádné volání cizí URL).
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyEtsyWebhook } from '@/lib/etsy/webhookSignature';
import { getEtsyClient } from '@/lib/etsy/connection';
import { handleEtsyReceipt, parseReceiptResource } from '@/lib/etsy/orders';
import { alertEtsy } from '@/lib/etsy/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY = 65_536;

export async function POST(request: Request) {
  const secret = process.env.ETSY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const limit = checkRateLimit(`etsy-webhook:${getClientIp(request)}`, 120, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const h = request.headers;
  const v = verifyEtsyWebhook({ id: h.get('webhook-id'), timestamp: h.get('webhook-timestamp'), signature: h.get('webhook-signature'), rawBody: raw, secret });
  if (!v.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const webhookId = h.get('webhook-id')!;
  try {
    await prisma.etsyWebhookEvent.create({ data: { webhookId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ ok: true, duplicate: true });
    throw err;
  }

  let payload: { event_type?: string; resource_url?: string };
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid' }, { status: 422 }); }
  const resource = parseReceiptResource(payload.resource_url);
  const isOrderEvent = payload.event_type === 'order.paid' || payload.event_type === 'order.canceled';
  if (isOrderEvent && !resource) {
    // Neznámý tvar resource_url — webhook by tiše nefungoval (review I8); polling to dožene, ale ať o tom víme
    console.error('[etsy-webhook] order událost bez čitelného resource_url', payload.event_type, String(payload.resource_url ?? '').slice(0, 200));
    return NextResponse.json({ ok: true, unparsed: true });
  }
  if (resource) {
    const conn = await prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { shopId: true } });
    if (conn && BigInt(resource.shopId) !== conn.shopId) {
      console.error('[etsy-webhook] událost pro cizí obchod', resource.shopId);
      return NextResponse.json({ ok: true, ignored: 'other_shop' });
    }
  }
  const receiptId = resource?.receiptId ?? null;

  try {
    if (payload.event_type === 'order.paid' && receiptId) {
      const client = await getEtsyClient();
      if (!client) {
        // Nepřipojeno — polling to dožene po připojení; Etsy znovu nedoručí (už jsme potvrdili), proto 200 + log.
        console.error(`[etsy-webhook] order.paid ${receiptId}: obchod není připojený, zpracuje polling`);
        return NextResponse.json({ ok: true, deferred: true });
      }
      const receipt = await client.getReceipt(receiptId);
      const r = await handleEtsyReceipt(receipt, 'webhook');
      return NextResponse.json({ ok: true, status: r.status });
    }
    if (payload.event_type === 'order.canceled' && receiptId) {
      const order = await prisma.etsyOrder.findUnique({ where: { receiptId: BigInt(receiptId) }, select: { itemIds: true } });
      const first = order?.itemIds[0];
      const item = first ? await prisma.item.findUnique({ where: { id: first }, select: { evidNumber: true, box: { select: { code: true } } } }) : null;
      await alertEtsy('order_canceled', { receiptId, catalogNumber: item ? `${item.box.code}-${item.evidNumber}` : undefined });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, ignored: payload.event_type ?? null });
  } catch (err) {
    // Etsy doručení zopakuje → smazat záznam webhook-id, ať další pokus projde
    await prisma.etsyWebhookEvent.deleteMany({ where: { webhookId } });
    console.error('[etsy-webhook] zpracování selhalo', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
