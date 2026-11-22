/** Administrace → Etsy: připojení obchodu, nastavení listingů, přehled stavů, konflikty a chyby. */
import EtsyAdmin from '@/components/etsy/EtsyAdmin';
import { requirePageAdmin } from '@/lib/pageAuth';
import { prisma } from '@/lib/prisma';
import { etsyConfigured } from '@/lib/etsy/config';

export const dynamic = 'force-dynamic';

export default async function AdminEtsyPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await requirePageAdmin();
  const sp = await searchParams;
  const configured = etsyConfigured();
  const [conn, groups, onEtsy, pending, errors] = await Promise.all([
    prisma.etsyConnection.findUnique({ where: { id: 1 }, select: { shopName: true, currencyCode: true, connectedAt: true, disconnectedReason: true } }),
    prisma.etsyListing.groupBy({ by: ['state', 'blockedReason'], _count: { _all: true } }),
    prisma.item.count({ where: { onEtsy: true, sold: false } }),
    prisma.etsyJob.count({ where: { doneAt: null } }),
    prisma.etsyListing.findMany({ where: { state: 'error' }, take: 50, select: { lastError: true, item: { select: { id: true, evidNumber: true, box: { select: { code: true } } } } } }),
  ]);
  const count = (state: string, reason?: string | null) =>
    groups.filter((g) => g.state === state && (reason === undefined || g.blockedReason === reason)).reduce((n, g) => n + g._count._all, 0);
  return (
    <EtsyAdmin
      configured={configured}
      notice={sp.connected ? 'connected' : sp.error ? 'error' : null}
      connection={conn ? { shopName: conn.shopName, currencyCode: conn.currencyCode, connectedAt: conn.connectedAt.toISOString(), disconnectedReason: conn.disconnectedReason } : null}
      stats={{ onEtsy, active: count('active'), reservation: count('inactive', 'reservation'), sold: count('inactive', 'sold'), off: count('inactive', 'off') + count('inactive', 'ineligible'), errors: errors.length, pending }}
      errors={errors.map((e) => ({ itemId: e.item.id, catalogNumber: `${e.item.box.code}-${e.item.evidNumber}`, error: e.lastError ?? '' }))}
    />
  );
}
