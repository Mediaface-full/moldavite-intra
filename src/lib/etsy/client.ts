/**
 * HTTP klient Etsy Open API v3 (https://developers.etsy.com). `fetchImpl` injektovatelný kvůli testům.
 * Těla požadavků: application/x-www-form-urlencoded (pole jako text oddělený čárkou), obrázky multipart.
 * Chyby: EtsyApiError — retryable pro 429, 5xx a síť. Text chyby nikdy nenese token ani klíč.
 */
import { ETSY_API, etsyApiKeyHeader } from './config';

export class EtsyApiError extends Error {
  constructor(public status: number, public body: string, public retryable: boolean) {
    super(`Etsy API ${status || 'síť'}: ${body.slice(0, 300)}`);
    this.name = 'EtsyApiError';
  }
}

export interface EtsyListingBody {
  quantity: 1;
  title: string;
  description: string;
  price: number;
  who_made: string;
  when_made: string;
  taxonomy_id: number;
  shipping_profile_id: bigint;
  readiness_state_id: bigint;
  return_policy_id?: bigint | null;
  tags: string[];
  materials: string[];
  is_supply: boolean;
  should_auto_renew: boolean;
}

export interface EtsyReceipt {
  receipt_id: number;
  is_paid: boolean;
  created_timestamp: number;
  transactions: Array<{ listing_id: number; sku?: string }>;
}

type FormValue = string | number | bigint | boolean | string[] | null | undefined;

function form(obj: Record<string, FormValue>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    p.append(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p;
}

export class EtsyClient {
  private accessToken: string;
  private shopId?: bigint;
  private fetchImpl: typeof fetch;

  constructor(opts: { accessToken: string; shopId?: bigint; fetchImpl?: typeof fetch }) {
    this.accessToken = opts.accessToken;
    this.shopId = opts.shopId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private shop(): string {
    if (this.shopId === undefined) throw new Error('EtsyClient: chybí shopId');
    return String(this.shopId);
  }

  private async request<T>(method: string, path: string, body?: URLSearchParams | FormData | string, contentType?: string): Promise<T> {
    const headers = new Headers({ 'x-api-key': etsyApiKeyHeader(), Authorization: `Bearer ${this.accessToken}` });
    if (contentType) headers.set('content-type', contentType);
    let res: Response;
    try {
      res = await this.fetchImpl(`${ETSY_API}${path}`, { method, headers, body, signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      throw new EtsyApiError(0, err instanceof Error ? err.message : 'network error', true);
    }
    const text = await res.text();
    if (!res.ok) throw new EtsyApiError(res.status, text, res.status === 429 || res.status >= 500);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private formRequest<T>(method: string, path: string, data: Record<string, FormValue>) {
    return this.request<T>(method, path, form(data).toString(), 'application/x-www-form-urlencoded');
  }

  getMe() { return this.request<{ user_id: number; shop_id: number }>('GET', '/users/me'); }
  getShop(shopId: bigint | number) { return this.request<{ shop_id: number; shop_name: string; currency_code: string }>('GET', `/shops/${shopId}`); }

  async getSellerTaxonomy() { return (await this.request<{ results: Array<{ id: number; name: string; children: unknown[] }> }>('GET', '/seller-taxonomy/nodes')).results; }
  async getShippingProfiles() { return (await this.request<{ results: Array<{ shipping_profile_id: number; title: string }> }>('GET', `/shops/${this.shop()}/shipping-profiles`)).results; }
  async getReadinessStates() { return (await this.request<{ results: Array<{ readiness_state_id: number; readiness_state: string; min_processing_time: number; max_processing_time: number; processing_time_unit: string }> }>('GET', `/shops/${this.shop()}/readiness-state-definitions`)).results; }
  async getReturnPolicies() { return (await this.request<{ results: Array<{ return_policy_id: number; accepts_returns: boolean; return_deadline: number | null }> }>('GET', `/shops/${this.shop()}/policies/return`)).results; }

  createDraftListing(b: EtsyListingBody) {
    return this.formRequest<{ listing_id: number; state: string }>('POST', `/shops/${this.shop()}/listings?legacy=false`, { ...b });
  }
  updateListing(listingId: number | bigint, patch: Partial<Omit<EtsyListingBody, 'quantity'>> & { state?: 'active' | 'inactive' }) {
    return this.formRequest<{ listing_id: number; state: string }>('PATCH', `/shops/${this.shop()}/listings/${listingId}?legacy=false`, { ...patch });
  }
  deleteListing(listingId: number | bigint) { return this.request<unknown>('DELETE', `/listings/${listingId}`); }
  getListing(listingId: number | bigint) { return this.request<{ listing_id: number; state: string; quantity: number }>('GET', `/listings/${listingId}`); }

  uploadListingImage(listingId: number | bigint, jpeg: Buffer, rank: number, filename: string) {
    const fd = new FormData();
    fd.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), filename);
    fd.append('rank', String(rank));
    return this.request<{ listing_image_id: number }>('POST', `/shops/${this.shop()}/listings/${listingId}/images`, fd);
  }
  deleteListingImage(listingId: number | bigint, imageId: number | bigint) {
    return this.request<unknown>('DELETE', `/shops/${this.shop()}/listings/${listingId}/images/${imageId}`);
  }

  updateInventory(listingId: number | bigint, sku: string, price: number, readinessStateId: bigint) {
    return this.request<unknown>('PUT', `/listings/${listingId}/inventory?legacy=false`, JSON.stringify({
      products: [{ sku, property_values: [], offerings: [{ price, quantity: 1, is_enabled: true, readiness_state_id: Number(readinessStateId) }] }],
    }), 'application/json');
  }

  getReceipt(receiptId: number | bigint) { return this.request<EtsyReceipt>('GET', `/shops/${this.shop()}/receipts/${receiptId}`); }

  async getPaidReceipts(minCreatedSec: number): Promise<EtsyReceipt[]> {
    const out: EtsyReceipt[] = [];
    for (let offset = 0; offset < 10_000; offset += 100) {
      const q = new URLSearchParams({ was_paid: 'true', min_created: String(minCreatedSec), limit: '100', offset: String(offset) });
      const page = await this.request<{ count: number; results: EtsyReceipt[] }>('GET', `/shops/${this.shop()}/receipts?${q}`);
      out.push(...page.results);
      if (page.results.length < 100) break;
    }
    return out;
  }
}
