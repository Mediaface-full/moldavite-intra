/**
 * Datum vystavení (onShopAt / onEtsyAt) při přechodu false → true — stejné pravidlo jako
 * PATCH /api/items/[id]. Při true → false se datum nemaže (audit „kdy byl naposled").
 *
 * Hromadné vystavení (PATCH /api/items/bulk) datum dřív nezapisovalo → 315 kamenů vystavených
 * 5. 10. 2026 mělo onShopAt = null (e-shop: řazení „Novinky", prodané kusy podle data vystavení).
 */
export function listingDates(
  prev: { onShop: boolean; onEtsy: boolean } | null | undefined,
  fields: { onShop?: unknown; onEtsy?: unknown },
  now: Date,
): { onShopAt?: Date; onEtsyAt?: Date } {
  if (!prev) return {};
  const out: { onShopAt?: Date; onEtsyAt?: Date } = {};
  if (fields.onShop === true && !prev.onShop) out.onShopAt = now;
  if (fields.onEtsy === true && !prev.onEtsy) out.onEtsyAt = now;
  return out;
}
