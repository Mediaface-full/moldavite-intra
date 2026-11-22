/** GET/PUT /api/etsy/settings — ADMIN. Nastavení listingů (kategorie, doprava, doba odeslání, štítky…). */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/auth';
import { parseEtsySettings } from '@/lib/etsy/settings';
import { jsonSafe, requireAdminApi } from '@/lib/etsy/adminAuth';
import { DEFAULT_ETSY_MATERIALS, DEFAULT_ETSY_TAGS } from '@/lib/etsy/content';

export const runtime = 'nodejs';

export async function GET() {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  const row = await prisma.etsySettings.findUnique({ where: { id: 1 } });
  return NextResponse.json(jsonSafe({
    settings: row ?? { taxonomyId: null, shippingProfileId: null, readinessStateId: null, returnPolicyId: null, whoMade: 'someone_else', whenMade: 'before_2007', isSupply: false, tags: [], materials: [] },
    defaults: { tags: DEFAULT_ETSY_TAGS, materials: DEFAULT_ETSY_MATERIALS },
  }));
}

export async function PUT(request: Request) {
  const s = await requireAdminApi();
  if (s instanceof NextResponse) return s;
  const parsed = parseEtsySettings(await request.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });
  await prisma.etsySettings.upsert({ where: { id: 1 }, create: { id: 1, ...parsed }, update: parsed });
  await logActivity(s.id, 'etsy.settings', '', 'Nastavení Etsy uloženo');
  // Změna nastavení mění otisk všech listingů → kontrola rozdílů je zařadí do fronty
  void import('@/lib/etsy/worker').then((m) => m.sweepEtsyDrift()).catch((e) => console.error('[etsy] sweep po uložení nastavení selhal', e));
  return NextResponse.json({ ok: true });
}
