import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ClickableRow from '@/components/ClickableRow';
import NewOrderButton from '@/components/orders/NewOrderButton';

function fmtMoney(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  return `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
}
function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('cs-CZ') : '—';
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Návrh', color: 'var(--muted-foreground)' },
  PRICED: { label: 'Naceněno', color: 'var(--info)' },
  PUBLISHED: { label: 'Publikováno', color: 'var(--success)' },
  CANCELLED: { label: 'Stornováno', color: 'var(--destructive)' },
  ARCHIVED: { label: 'Archiv', color: 'var(--muted-foreground)' },
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orders = await prisma.order.findMany({
    include: { _count: { select: { items: true, costs: true } } },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Zakázky</h1>
          <p className="text-sm text-muted-foreground mt-1">Nákupy, náklady a cenotvorba kamenů</p>
        </div>
        <NewOrderButton />
      </div>

      {orders.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <p className="text-muted-foreground mb-4">Zatím žádné zakázky.</p>
          <p className="text-xs text-muted-foreground font-mono">
            Vytvoř první zakázku tlačítkem nahoře, nebo spusť migraci existujících kazet.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kód</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Název</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Prodejce</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Datum</th>
                <th className="text-right px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Nákup</th>
                <th className="text-right px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kameny</th>
                <th className="text-right px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Náklady</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Stav</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const s = STATUS_LABEL[o.status] ?? { label: o.status, color: 'var(--muted-foreground)' };
                return (
                  <ClickableRow
                    key={o.id}
                    href={`/orders/${o.id}`}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-foreground tracking-tight">{o.code}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{o.title || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.sellerName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{fmtDate(o.purchaseDate)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(o.totalPurchaseAmountCzk)}</td>
                    <td className="px-4 py-3 text-right font-mono">{o._count.items}</td>
                    <td className="px-4 py-3 text-right font-mono">{o._count.costs}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border"
                        style={{
                          color: s.color,
                          background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                          borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`,
                        }}
                      >
                        {s.label}
                      </span>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-muted-foreground font-mono">
        {orders.length} {orders.length === 1 ? 'zakázka' : orders.length < 5 ? 'zakázky' : 'zakázek'}
      </div>
    </div>
  );
}
