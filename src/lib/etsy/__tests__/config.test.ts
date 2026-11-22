import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { etsyConfigured, etsyApiKeyHeader, etsyRedirectUri } from '@/lib/etsy/config';

const KEYS = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_TOKEN_KEY', 'NEXT_PUBLIC_BASE_URL'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('etsy config', () => {
  it('bez ETSY_KEYSTRING vypnuto', () => {
    expect(etsyConfigured()).toBe(false);
  });
  it('se všemi třemi hodnotami zapnuto', () => {
    Object.assign(process.env, { ETSY_KEYSTRING: 'ks', ETSY_SHARED_SECRET: 'secret', ETSY_TOKEN_KEY: 'a'.repeat(64) });
    expect(etsyConfigured()).toBe(true);
  });
  it('ETSY_TOKEN_KEY musí být 64 hex znaků', () => {
    Object.assign(process.env, { ETSY_KEYSTRING: 'ks', ETSY_SHARED_SECRET: 'secret', ETSY_TOKEN_KEY: 'xyz' });
    expect(etsyConfigured()).toBe(false);
  });
  it('x-api-key = keystring:secret', () => {
    Object.assign(process.env, { ETSY_KEYSTRING: 'ks', ETSY_SHARED_SECRET: 'secret' });
    expect(etsyApiKeyHeader()).toBe('ks:secret');
  });
  it('redirect URI z NEXT_PUBLIC_BASE_URL', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://app.bohemianmoldavite.com/';
    expect(etsyRedirectUri()).toBe('https://app.bohemianmoldavite.com/api/etsy/oauth/callback');
  });
});
