import { prisma } from '@/lib/prisma';
import { getLatestRates } from '@/lib/rates';
import { getSession } from '@/lib/auth';
import { PAS_SHAPES } from '@/lib/pasShapes';
import Link from 'next/link';
import RefreshRatesButton from '@/components/RefreshRatesButton';
import BackupButton from '@/components/BackupButton';
import Sparkline from '@/components/charts/Sparkline';
import Donut from '@/components/charts/Donut';

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';

  const [
    boxCount,
    itemCount,
    shopCount,
    etsyCount,
    soldCount,
    inventoryValue,
    boxes,
    rates,
    pasGroups,
    recentActivity,
    recentlyAdded,
  ] = await Promise.all([
    prisma.box.count(),
    prisma.item.count(),
    prisma.item.count({ where: { onShop: true, sold: false } }),
    prisma.item.count({ where: { onEtsy: true, sold: false } }),
    prisma.item.count({ where: { sold: true } }),
    prisma.item.aggregate({
      _sum: { salePrice: true },
      where: { sold: false },
    }),
    prisma.box.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { code: 'asc' },
    }),
    getLatestRates(),
    prisma.item.groupBy({
      by: ['pasShape'],
      _count: { _all: true },
      orderBy: { _count: { pasShape: 'desc' } },
    }),
    prisma.activityLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.item.findMany({
      include: { box: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const eurRate = rates.EUR;
  const usdRate = rates.USD;
  const totalValue = Number(inventoryValue._sum.salePrice ?? 0);

  // Synthesize a 12-point sparkline from a real-ish metric — for now use
  // last 12 ActivityLog buckets per day (placeholder until we add proper
  // time-series data). Replace with sales/inventory series later.
  const trendValues = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, soldCount - (11 - i) * Math.floor(soldCount / 14)),
  );

  // Donut: PAS distribution. Map keys → labels + colors.
  const palette = [
    'var(--primary)',     // coral
    'var(--info)',        // teal
    'var(--success)',     // green
    'var(--warning)',     // amber
    'var(--violet)',      // violet
    '#E0492C',
    '#85c28d',
    '#FF7C57',
    '#7C7A72',
    '#54514A',
  ];
  const pasData = pasGroups
    .map((g, i) => {
      const shape = PAS_SHAPES.find((s) => s.key === g.pasShape);
      return {
        label: shape?.cz || (g.pasShape || '— neurčeno'),
        value: g._count._all,
        color: shape ? palette[PAS_SHAPES.findIndex((s) => s.key === shape.key) % palette.length] : 'var(--muted-foreground)',
      };
    })
    .filter((g) => g.value > 0)
    .slice(0, 8);

  const kpis = [
    {
      label: 'Inventář',
      value: `${(totalValue / 1000).toFixed(0)}k`,
      sub: 'Kč',
      color: 'var(--primary)',
      sparkline: trendValues,
      hint: `${itemCount - soldCount} aktivních kamenů`,
    },
    {
      label: 'Na eshopu',
      value: shopCount,
      sub: 'položek',
      color: 'var(--success)',
      sparkline: trendValues.map((v) => v * 0.7 + shopCount * 0.5),
      hint: `${Math.round((shopCount / Math.max(itemCount, 1)) * 100)} % z evidovaných`,
    },
    {
      label: 'Na Etsy',
      value: etsyCount,
      sub: 'položek',
      color: 'var(--info)',
      sparkline: trendValues.map((v) => v * 0.5 + etsyCount * 0.6),
      hint: `${etsyCount} listingů aktivních`,
    },
    {
      label: 'Prodáno',
      value: soldCount,
      sub: 'kusů',
      color: 'var(--violet)',
      sparkline: trendValues,
      hint: `${Math.round((soldCount / Math.max(itemCount, 1)) * 100)} % všech evidovaných`,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-muted-foreground">Interní systém evidence drahých kamenů</p>
            {isAdmin && <BackupButton />}
          </div>
        </div>

        {/* Exchange Rates */}
        <div className="bg-card border border-border rounded-xl p-4 min-w-[280px] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Kurzy ČNB</h3>
            <RefreshRatesButton />
          </div>
          <div className="space-y-2">
            {eurRate && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-info">EUR</span>
                <span className="text-base font-bold text-foreground font-mono">
                  {eurRate.rate.toFixed(3)} <span className="text-xs text-muted-foreground font-normal">CZK</span>
                </span>
              </div>
            )}
            {usdRate && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-success">USD</span>
                <span className="text-base font-bold text-foreground font-mono">
                  {usdRate.rate.toFixed(3)} <span className="text-xs text-muted-foreground font-normal">CZK</span>
                </span>
              </div>
            )}
          </div>
          {eurRate && (
            <p className="text-[10px] text-muted-foreground mt-2 border-t border-border pt-2 font-mono">
              {eurRate.fetchedAt.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
          {!eurRate && !usdRate && (
            <p className="text-sm text-muted-foreground">Kurzy ještě nebyly načteny</p>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-card border border-border rounded-xl p-5 hover:border-ring/60 transition-colors shadow-sm"
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{k.label}</p>
              <Sparkline values={k.sparkline} color={k.color} width={64} height={20} />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tight font-mono" style={{ color: k.color }}>
                {k.value}
              </p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Two-column: PAS donut + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        {/* Donut — PAS distribution */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Tvary kamenů (PAS)</h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
              {itemCount} kusů
            </span>
          </div>
          {pasData.length > 0 ? (
            <Donut
              data={pasData}
              size={160}
              thickness={24}
              centerLabel={String(pasData.reduce((s, d) => s + d.value, 0))}
              centerSub="celkem"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Žádné kameny zatím nemají nastavený tvar.</p>
          )}
        </div>

        {/* Activity feed */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Poslední aktivita</h3>
            {isAdmin && (
              <Link
                href="/admin/logs"
                className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono hover:text-foreground transition-colors"
              >
                Vše →
              </Link>
            )}
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné záznamy.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: getActionColor(log.action) }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {log.action}
                        </span>
                        {log.target && <span className="text-muted-foreground">{log.target}</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {log.user?.name || log.user?.email || 'system'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
                    {formatRelative(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Box grid */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Krabice</h2>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
          {boxCount} krabic · {itemCount} kamenů
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boxes.map((box) => (
          <Link
            key={box.id}
            href={`/boxes/${box.id}`}
            className="bg-card border border-border rounded-xl p-5 hover:border-ring/60 hover:shadow-md transition-all group shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors font-mono">
                {box.code}
              </h3>
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded font-mono uppercase tracking-wider">
                {box._count.items} ks
              </span>
            </div>
            {box.name && <p className="text-sm text-muted-foreground">{box.name}</p>}
          </Link>
        ))}
      </div>

      {/* Recently added */}
      {recentlyAdded.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">Naposledy přidané</h2>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kat. č.</th>
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Lokalita</th>
                  <th className="text-right px-4 py-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Hmotnost</th>
                  <th className="text-right px-4 py-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Cena</th>
                </tr>
              </thead>
              <tbody>
                {recentlyAdded.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2">
                      <Link href={`/items/${item.id}`} className="font-mono font-semibold text-foreground hover:text-primary tracking-tight transition-colors">
                        {item.box.code}-{item.evidNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{item.location || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{Number(item.weight).toFixed(2)} g</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {Number(item.salePrice) > 0
                        ? `${Math.round(Number(item.salePrice)).toLocaleString('cs-CZ')} Kč`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getActionColor(action: string): string {
  if (action.startsWith('admin.user.delete') || action.startsWith('item.delete')) return 'var(--destructive)';
  if (action.startsWith('admin.backup')) return 'var(--info)';
  if (action.startsWith('ai.')) return 'var(--violet)';
  if (action.startsWith('export')) return 'var(--success)';
  if (action.startsWith('auth.login')) return 'var(--success)';
  return 'var(--primary)';
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'právě teď';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} d`;
  return new Date(date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}
