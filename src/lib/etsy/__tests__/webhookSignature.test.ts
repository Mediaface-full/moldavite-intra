import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyEtsyWebhook } from '@/lib/etsy/webhookSignature';

const rawKey = Buffer.from('etsy-webhook-test-key-0123456789');
const secret = `whsec_${rawKey.toString('base64')}`;
const sign = (id: string, ts: string, body: string) => createHmac('sha256', rawKey).update(`${id}.${ts}.${body}`).digest('base64');
const NOW = 1_800_000_000;
const body = '{"event_type":"order.paid"}';
const base = { id: 'msg_1', timestamp: String(NOW), rawBody: body, secret, nowSec: NOW };

describe('podpis Etsy webhooku', () => {
  it('platný podpis', () => {
    expect(verifyEtsyWebhook({ ...base, signature: `v1,${sign('msg_1', String(NOW), body)}` })).toEqual({ ok: true });
  });
  it('více podpisů v hlavičce, platný druhý', () => {
    expect(verifyEtsyWebhook({ ...base, signature: `v1,xxxx v1,${sign('msg_1', String(NOW), body)}` })).toEqual({ ok: true });
  });
  it('jiné tělo → bad_signature', () => {
    expect(verifyEtsyWebhook({ ...base, rawBody: '{"x":1}', signature: `v1,${sign('msg_1', String(NOW), body)}` })).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('starší než 300 s → stale', () => {
    const ts = String(NOW - 301);
    expect(verifyEtsyWebhook({ ...base, timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` })).toEqual({ ok: false, reason: 'stale' });
  });
  it('chybějící hlavička → missing', () => {
    expect(verifyEtsyWebhook({ ...base, signature: null })).toEqual({ ok: false, reason: 'missing' });
  });
});
