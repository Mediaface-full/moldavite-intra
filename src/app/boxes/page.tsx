import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ScanNewBoxButton from '@/components/ScanNewBoxButton';
import { CASSETTE_TYPE_META } from '@/lib/cassetteType';
import Icon from '@/components/Icon';

export default async function BoxesPage() {
  const boxes = await prisma.box.findMany({
    include: {
      _count: { select: { items: true } },
      order: { select: { id: true, code: true } },
      items: {
        select: {
          id: true,
          onShop: true,
          pricingStatus: true,
          finalInternalPriceInclVatCzk: true,
          computedMinPriceExVatCzk: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  function fmtMoney(n: number): string {
    if (!Number.isFinite(n) || n === 0) return '—';
    return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Kazety</h1>
          <p className="text-sm text-muted-foreground mt-1">Správa kazet s moldavity</p>
        </div>
        <ScanNewBoxButton />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {boxes.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            Zatím žádné kazety.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {boxes.map((box) => {
              const meta = CASSETTE_TYPE_META[box.cassetteType];
              const itemCount = box.items.length;
              const shopCount = box.items.filter((i) => i.onShop).length;
              const attentionCount = box.items.filter(
                (i) => i.pricingStatus === 'NEEDS_INPUT' || i.pricingStatus === 'NEEDS_REVIEW',
              ).length;
              const sumInclVat = box.items.reduce(
                (s, i) => s + Number(i.finalInternalPriceInclVatCzk ?? 0),
                0,
              );
              const sumExVat = box.items.reduce(
                (s, i) => s + Number(i.computedMinPriceExVatCzk ?? 0),
                0,
              );
              // Fallback: pokud computedMinPriceExVatCzk chybi (legacy), odhadni / 1.21
              const exVatDisplay = sumExVat > 0 ? sumExVat : sumInclVat / 1.21;

              return (
                <li key={box.id}>
                  <Link
                    href={`/boxes/${box.id}`}
                    className="grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_auto_auto_auto_auto] items-center gap-x-5 gap-y-1 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Kód + typ */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-foreground text-base">{box.code}</span>
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border whitespace-nowrap"
                          style={{
                            color: meta.color,
                            background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                            borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
                          }}
                        >
                          <Icon name={meta.icon} className="w-3 h-3" />
                          {meta.short}
                        </span>
                      </div>
                    </div>

                    {/* Zakázka */}
                    <div className="min-w-0 text-sm">
                      {box.order ? (
                        <span className="font-mono text-muted-foreground">
                          <span className="text-[10px] uppercase tracking-wider opacity-70 mr-1.5">Zakázka:</span>
                          <span className="text-foreground">{box.order.code}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">skladová</span>
                      )}
                    </div>

                    {/* Počet kamenů */}
                    <div className="text-right min-w-[80px]">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kameny</p>
                      <p className="text-sm font-mono text-foreground">{itemCount}</p>
                    </div>

                    {/* Cena bez DPH */}
                    <div className="text-right min-w-[110px]">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Bez DPH</p>
                      <p className="text-sm font-mono text-muted-foreground">{fmtMoney(exVatDisplay)}</p>
                    </div>

                    {/* Cena s DPH */}
                    <div className="text-right min-w-[110px]">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">S DPH</p>
                      <p
                        className="text-sm font-mono"
                        style={{ color: sumInclVat > 0 ? 'var(--success)' : 'var(--muted-foreground)' }}
                      >
                        {fmtMoney(sumInclVat)}
                      </p>
                    </div>

                    {/* Stav (warning chip + shop count) */}
                    <div className="flex items-center justify-end gap-2 min-w-[120px]">
                      {attentionCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold font-mono whitespace-nowrap"
                          style={{ color: '#FFFFFF', background: 'var(--warning)' }}
                          title={`${attentionCount} kamenů vyžaduje pozornost`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          {attentionCount}
                        </span>
                      ) : itemCount > 0 ? (
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md"
                          style={{
                            background: 'color-mix(in srgb, var(--success) 14%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
                            color: 'var(--success)',
                          }}
                          title="Všechny kameny OK"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      ) : null}
                      {shopCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--success)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                          {shopCount} eshop
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 text-xs text-muted-foreground font-mono">
        {boxes.length} {boxes.length === 1 ? 'kazeta' : boxes.length < 5 ? 'kazety' : 'kazet'}
      </div>
    </div>
  );
}
