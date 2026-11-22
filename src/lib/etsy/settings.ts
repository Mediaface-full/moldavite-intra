/** Validace nastavení Etsy z Administrace (PUT /api/etsy/settings). */
export interface EtsySettingsInput {
  taxonomyId: number | null; shippingProfileId: bigint | null; readinessStateId: bigint | null; returnPolicyId: bigint | null;
  whoMade: string; whenMade: string; isSupply: boolean; tags: string[]; materials: string[];
}
const WHO = ['i_did', 'someone_else', 'collective'];

function optId(v: unknown, name: string): bigint | null | { error: string } {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  if (!/^\d{1,19}$/.test(s)) return { error: `${name}: neplatné číslo` };
  return BigInt(s);
}

export function parseEtsySettings(body: unknown): EtsySettingsInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Neplatné tělo' };
  const b = body as Record<string, unknown>;
  const ids: Record<string, bigint | null> = {};
  for (const k of ['shippingProfileId', 'readinessStateId', 'returnPolicyId']) {
    const r = optId(b[k], k);
    if (r && typeof r === 'object' && 'error' in r) return r;
    ids[k] = r as bigint | null;
  }
  const tax = b.taxonomyId === null || b.taxonomyId === undefined || b.taxonomyId === '' ? null : Number(b.taxonomyId);
  if (tax !== null && (!Number.isInteger(tax) || tax <= 0)) return { error: 'Kategorie: neplatné číslo' };
  if (typeof b.whoMade !== 'string' || !WHO.includes(b.whoMade)) return { error: 'Kdo vyrobil: neplatná hodnota' };
  if (typeof b.whenMade !== 'string' || !/^[a-z0-9_]{2,30}$/.test(b.whenMade)) return { error: 'Kdy vyrobeno: neplatná hodnota' };
  const list = (v: unknown, name: string, max: number): string[] | { error: string } => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return { error: `${name}: musí být seznam textů` };
    const items = v.map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (items.length > max) return { error: `${name}: max ${max}` };
    if (items.some((x) => x.length > 20)) return { error: `${name}: každý max 20 znaků` };
    return [...new Set(items)];
  };
  const tags = list(b.tags, 'Štítky', 13);
  if ('error' in tags) return tags;
  const materials = list(b.materials, 'Materiály', 13);
  if ('error' in materials) return materials;
  return {
    taxonomyId: tax, shippingProfileId: ids.shippingProfileId, readinessStateId: ids.readinessStateId, returnPolicyId: ids.returnPolicyId,
    whoMade: b.whoMade, whenMade: b.whenMade, isSupply: b.isSupply === true, tags, materials,
  };
}
