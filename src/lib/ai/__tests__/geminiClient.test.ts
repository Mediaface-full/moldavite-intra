import { describe, it, expect } from 'vitest';
import { parseGeminiError, callGemini } from '../geminiClient';

const quotaBody = JSON.stringify({
  error: {
    code: 429, status: 'RESOURCE_EXHAUSTED',
    message: 'You exceeded your current quota, please check your plan and billing details.',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' },
    ],
  },
});

describe('parseGeminiError', () => {
  it('vytáhne zprávu, kvótu a retryDelay', () => {
    const r = parseGeminiError(429, quotaBody);
    expect(r.reason).toContain('exceeded your current quota');
    expect(r.reason).toContain('FreeTier');
    expect(r.retryAfterSec).toBe(37);
  });
  it('ne-JSON tělo → text, Retry-After hlavička', () => {
    const r = parseGeminiError(503, 'overloaded', '20');
    expect(r.reason).toBe('overloaded');
    expect(r.retryAfterSec).toBe(20);
  });
});

function mockFetch(responses: Array<{ status: number; body: string; headers?: Record<string, string> }>): typeof fetch {
  let i = 0;
  return (async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(r.body, { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
}

describe('callGemini retry', () => {
  it('429 → počká podle retryDelay (s horní mezí) a napodruhé uspěje', async () => {
    const waits: number[] = [];
    const ok = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"name_cz":"x"}' }] } }] });
    const r = await callGemini('p', { attempts: 3, maxWaitMs: 10_000 }, mockFetch([{ status: 429, body: quotaBody }, { status: 200, body: ok }]), async (ms) => { waits.push(ms); });
    expect(r.ok).toBe(true);
    expect(waits).toEqual([10_000]); // 37 s ořezáno na maxWaitMs
  });
  it('trvalé 429 → quota: true s důvodem od Googlu, bez dalšího čekání po posledním pokusu', async () => {
    const waits: number[] = [];
    const r = await callGemini('p', { attempts: 2, maxWaitMs: 5_000 }, mockFetch([{ status: 429, body: quotaBody }]), async (ms) => { waits.push(ms); });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.quota).toBe(true); expect(r.error).toContain('429'); expect(r.error).toContain('quota'); expect(r.retryAfterSec).toBe(37); }
    expect(waits).toEqual([5_000]);
  });
  it('400 se neopakuje', async () => {
    const waits: number[] = [];
    const r = await callGemini('p', { attempts: 3, maxWaitMs: 5_000 }, mockFetch([{ status: 400, body: '{"error":{"message":"bad"}}' }]), async (ms) => { waits.push(ms); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.quota).toBe(false);
    expect(waits).toEqual([]);
  });
});
