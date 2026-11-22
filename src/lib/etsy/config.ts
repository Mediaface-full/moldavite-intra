/**
 * Konfigurace napojení na Etsy (Open API v3). Env se čte při volání (testy, restart bez rebuildu).
 * Bez ETSY_KEYSTRING / ETSY_SHARED_SECRET / ETSY_TOKEN_KEY je napojení vypnuté a intra jede jako dřív.
 * Spec: docs/superpowers/specs/2026-11-21-etsy-napojeni-design.md
 */
export const ETSY_API = 'https://api.etsy.com/v3/application';
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
export const ETSY_CONNECT_URL = 'https://www.etsy.com/oauth/connect';
export const ETSY_SCOPES = 'listings_r listings_w listings_d shops_r transactions_r';

export function etsyConfigured(): boolean {
  return !!process.env.ETSY_KEYSTRING && !!process.env.ETSY_SHARED_SECRET && /^[0-9a-f]{64}$/i.test(process.env.ETSY_TOKEN_KEY ?? '');
}

export function etsyApiKeyHeader(): string {
  return `${process.env.ETSY_KEYSTRING ?? ''}:${process.env.ETSY_SHARED_SECRET ?? ''}`;
}

export function etsyRedirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/api/etsy/oauth/callback`;
}
