import { describe, it, expect } from 'vitest';
import { editPhoto } from '@/lib/ai/geminiImage';

const img = Buffer.from('x');
const ok = (tier: string) => new Response(JSON.stringify({
  usageMetadata: { serviceTier: tier },
  candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('IMG').toString('base64'), mimeType: 'image/jpeg' } }] } }],
}), { status: 200 });
const busy = () => new Response(JSON.stringify({ error: { message: 'capacity' } }), { status: 503 });

function recorder(responses: Array<() => Response>) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return responses[bodies.length - 1]();
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
}
const noSleep = async () => {};

describe('editPhoto — Flex', () => {
  it('posílá service_tier flex a vrací obrázek + tier', async () => {
    const { bodies, fetchImpl } = recorder([() => ok('flex')]);
    const r = await editPhoto(img, { attempts: 3, maxWaitMs: 0 }, fetchImpl, noSleep);
    expect(r.ok && r.tier).toBe('flex');
    expect(bodies[0].service_tier).toBe('flex');
  });
  it('Flex 2× odmítnut (503) → poslední pokus standardně, bez service_tier', async () => {
    const { bodies, fetchImpl } = recorder([busy, busy, () => ok('standard')]);
    const r = await editPhoto(img, { attempts: 3, maxWaitMs: 0 }, fetchImpl, noSleep);
    expect(r.ok && r.tier).toBe('standard');
    expect(bodies.map((b) => b.service_tier ?? 'standard')).toEqual(['flex', 'flex', 'standard']);
  });
  it('chyba bez opakování (400) skončí hned', async () => {
    const { bodies, fetchImpl } = recorder([() => new Response('{"error":{"message":"bad"}}', { status: 400 })]);
    const r = await editPhoto(img, { attempts: 3, maxWaitMs: 0 }, fetchImpl, noSleep);
    expect(r.ok).toBe(false);
    expect(bodies).toHaveLength(1);
  });
});
