import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ClickableRow from '@/components/ClickableRow';
import NewOrderButton from '@/components/orders/NewOrderButton';
import Icon, { type IconName } from '@/components/Icon';

function fmtMoney(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  return `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
}
function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('cs-CZ') : '—';
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: IconName }> = {
  DRAFT:     { label: 'Návrh',       color: 'var(--muted-foreground)', icon: 'edit' },
  PRICED:    { label: 'Naceněno',    color: 'var(--info)',             icon: 'calc' },
  PUBLISHED: { label: 'Publikováno', color: 'var(--success)',          icon: 'ok' },
  CANCELLED: { label: 'Stornováno',  color: 'var(--destructive)',      icon: 'ban' },
  ARCHIVED:  { label: 'Archiv',      color: 'var(--muted-foreground)', icon: 'storage' },
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orders = await prisma.order.findMany({
    include: {
      _count: { select: { items: true, costs: true } },
      // Pricing status per kamen — pro varovny chip „K revizi / bez vstupu"
      // ve sloupci Kameny. Light select, bez relations.
      items: { select: { pricingStatus: true } },
    },
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
                const s = STATUS_LABEL[o.status] ?? { label: o.status, color: 'var(--muted-foreground)', icon: 'info' as IconName };
                const needsReview = o.items.filter((i) => i.pricingStatus === 'NEEDS_REVIEW').length;
                const needsInput = o.items.filter((i) => i.pricingStatus === 'NEEDS_INPUT').length;
                const totalAttention = needsReview + needsInput;
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
                    <td className="px-4 py-3 text-right font-mono">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <span>{o._count.items}</span>
                        {totalAttention > 0 && (
                          <span
                            title={
                              needsInput > 0 && needsReview > 0
                                ? `${needsInput} kamenů bez vstupů + ${needsReview} kamenů k revizi`
                                : needsInput > 0
                                  ? `${needsInput} kamenů bez vstupů pro cenu`
                                  : `${needsReview} kamenů k revizi (chybí povinná pole)`
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase tracking-wider cursor-help"
                            style={{
                              color: '#FFFFFF',
                              background: 'var(--warning)',
                            }}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            {totalAttention}
                          </span>
                        )}
                      </div>
                    </td>
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
                        <Icon name={s.icon} className="w-3 h-3" />
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
