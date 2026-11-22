/** GET /api/etsy/options — ADMIN. Seznamy z obchodu na Etsy pro výběry v Administraci (cache 10 min). */
import { NextResponse } from 'next/server';
import { getEtsyClient } from '@/lib/etsy/connection';
import { jsonSafe, requireAdminApi } from '@/lib/etsy/adminAuth';

export const runtime = 'nodejs';
let cache: { at: number; data: unknown } | null = null;

type Node = { id: number; name: string; children?: Node[] };
function flatten(nodes: Node[], prefix = ''): Array<{ id: number; name: string }> {
  return nodes.flatMap((n) => [{ id: n.id, name: `${prefix}${n.name}` }, ...flatten(n.children ?? [], `${prefix}${n.name} › `)]);
}

export async function GET(request: Request) {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  if (cache && !fresh && Date.now() - cache.at < 600_000) return NextResponse.json(cache.data);
  const client = await getEtsyClient();
  if (!client) return NextResponse.json({ error: 'Obchod na Etsy není připojený' }, { status: 409 });
  try {
    const [taxonomy, shippingProfiles, readinessStates, returnPolicies] = await Promise.all([
      client.getSellerTaxonomy(), client.getShippingProfiles(), client.getReadinessStates(), client.getReturnPolicies(),
    ]);
    const data = jsonSafe({ taxonomy: flatten(taxonomy as Node[]), shippingProfiles, readinessStates, returnPolicies });
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Etsy nedostupné' }, { status: 502 });
  }
}
