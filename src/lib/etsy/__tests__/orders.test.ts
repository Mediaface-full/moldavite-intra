import { describe, it, expect, vi } from 'vitest';
import { handleEtsyReceiptWith, receiptIdFromResourceUrl, type OrderDeps } from '@/lib/etsy/orders';

const receipt = (listingIds: number[], id = 9001) => ({ receipt_id: id, is_paid: true, created_timestamp: 1_800_000_000, transactions: listingIds.map((l) => ({ listing_id: l })) });

function deps(over: Partial<OrderDeps> = {}) {
  const orders = new Set<number>();
  const saved: Record<string, unknown>[] = [];
  const d: OrderDeps = {
    releaseClaim: vi.fn(async (id: number) => { orders.delete(id); }),
    claimOrder: vi.fn(async (id: number) => { if (orders.has(id)) return false; orders.add(id); return true; }),
    finishOrder: vi.fn(async (_id, data) => { saved.push(data); }),
    mapItems: vi.fn(async (tx: Array<{ listing_id: number }>) => tx.map((t) => ({ listingId: t.listing_id, itemId: t.listing_id === 999 ? null : t.listing_id }))),
    sellItem: vi.fn(async (itemId: number) => ({ outcome: 'sold' as const, catalogNumber: `K-${itemId}`, shopOrder: '' })),
    alert: vi.fn(async () => {}),
    log: vi.fn(async () => {}),
    notifyShop: vi.fn(async () => {}),
    ...over,
  };
  return { d, saved };
}

describe('handleEtsyReceipt', () => {
  it('neprodaný kámen → sold, e-shop upozorněn', async () => {
    const { d } = deps();
    const r = await handleEtsyReceiptWith(receipt([11]), 'webhook', d);
    expect(r).toEqual({ status: 'sold', itemIds: [11] });
    expect(d.notifyShop).toHaveBeenCalledWith([11]);
    expect(d.alert).not.toHaveBeenCalled();
  });
  it('stejná objednávka podruhé (webhook pak polling) → duplicate, žádný druhý prodej ani upozornění', async () => {
    const { d } = deps();
    await handleEtsyReceiptWith(receipt([11]), 'webhook', d);
    const r = await handleEtsyReceiptWith(receipt([11]), 'poll', d);
    expect(r.status).toBe('duplicate');
    expect(d.sellItem).toHaveBeenCalledTimes(1);
    expect(d.notifyShop).toHaveBeenCalledTimes(1);
  });
  it('kámen už prodaný přes e-shop → conflict + upozornění double_sale', async () => {
    const { d, saved } = deps({ sellItem: vi.fn(async () => ({ outcome: 'already_sold' as const, catalogNumber: 'K-11', shopOrder: '2026-0042' })) });
    const r = await handleEtsyReceiptWith(receipt([11]), 'webhook', d);
    expect(r.status).toBe('conflict');
    expect(d.alert).toHaveBeenCalledWith('double_sale', expect.objectContaining({ catalogNumber: 'K-11', shopOrder: '2026-0042' }));
    expect(saved[0]).toMatchObject({ conflict: true });
    expect(d.notifyShop).not.toHaveBeenCalled();
  });
  it('kámen měl rezervaci e-shopu → sold + upozornění sold_with_reservation', async () => {
    const { d } = deps({ sellItem: vi.fn(async () => ({ outcome: 'sold_with_reservation' as const, catalogNumber: 'K-11', shopOrder: '' })) });
    const r = await handleEtsyReceiptWith(receipt([11]), 'webhook', d);
    expect(r.status).toBe('sold');
    expect(d.alert).toHaveBeenCalledWith('sold_with_reservation', expect.anything());
  });
  it('2 známé + 1 neznámý listing → 2 prodané, neznámý jen do logu', async () => {
    const { d } = deps();
    const r = await handleEtsyReceiptWith(receipt([11, 12, 999]), 'webhook', d);
    expect(r).toEqual({ status: 'sold', itemIds: [11, 12] });
    expect(d.log).toHaveBeenCalledWith('etsy.unknown_listing', expect.stringContaining('999'));
  });
  it('nezaplacená → ignored', async () => {
    const { d } = deps();
    expect((await handleEtsyReceiptWith({ ...receipt([11]), is_paid: false }, 'poll', d)).status).toBe('ignored');
    expect(d.claimOrder).not.toHaveBeenCalled();
  });
});

describe('receiptIdFromResourceUrl', () => {
  it('vytáhne číslo objednávky jen z adresy Etsy API', () => {
    expect(receiptIdFromResourceUrl('https://api.etsy.com/v3/application/shops/77/receipts/123456')).toBe(123456);
    expect(receiptIdFromResourceUrl(undefined)).toBeNull();
  });
});

describe('opravy po kontrole', () => {
  it('C1: sellItem selže → claim se uvolní a opakované doručení kámen prodá', async () => {
    let fail = true;
    const released: number[] = [];
    const { d } = deps({
      sellItem: vi.fn(async (itemId: number) => { if (fail) { fail = false; throw new Error('deadlock'); } return { outcome: 'sold' as const, catalogNumber: `K-${itemId}`, shopOrder: '' }; }),
    });
    const claimed = new Set<number>();
    d.claimOrder = vi.fn(async (id: number) => { if (claimed.has(id)) return false; claimed.add(id); return true; });
    d.releaseClaim = vi.fn(async (id: number) => { claimed.delete(id); released.push(id); });
    await expect(handleEtsyReceiptWith(receipt([11]), 'webhook', d)).rejects.toThrow('deadlock');
    expect(released).toEqual([9001]);
    expect(await handleEtsyReceiptWith(receipt([11]), 'webhook', d)).toEqual({ status: 'sold', itemIds: [11] });
  });
  it('I8: číslo objednávky i z jiné domény Etsy, jen ze správné cesty', () => {
    expect(receiptIdFromResourceUrl('https://openapi.etsy.com/v3/application/shops/77/receipts/42')).toBe(42);
    expect(receiptIdFromResourceUrl('https://api.etsy.com/v3/application/shops/77/receipts/42?x=1')).toBe(42);
    expect(receiptIdFromResourceUrl('https://api.etsy.com/v3/application/listings/42')).toBeNull();
  });
  it('I7: polling se dívá pevně 72 h zpět', async () => {
    const { pollWindowStartSec } = await import('@/lib/etsy/orders');
    expect(pollWindowStartSec(1_800_000_000_000)).toBe(1_800_000_000 - 72 * 3600);
  });
});

describe('odložené drobnosti (objednávky)', () => {
  it('M7: neznámý listing v objednávce → i upozornění (kámen může být ještě na e-shopu)', async () => {
    const { d } = deps();
    await handleEtsyReceiptWith(receipt([999]), 'webhook', d);
    expect(d.alert).toHaveBeenCalledWith('unknown_listing', expect.objectContaining({ receiptId: 9001 }));
  });
});
