import { prisma } from '@/lib/prisma';
import { getLatestRates } from '@/lib/rates';
import { getSession } from '@/lib/auth';
import Link from 'next/link';
import RefreshRatesButton from '@/components/RefreshRatesButton';
import BackupButton from '@/components/BackupButton';

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';

  const [boxCount, itemCount, shopCount, etsyCount, soldCount, boxes, rates] = await Promise.all([
    prisma.box.count(),
    prisma.item.count(),
    prisma.item.count({ where: { onShop: true, sold: false } }),
    prisma.item.count({ where: { onEtsy: true, sold: false } }),
    prisma.item.count({ where: { sold: true } }),
    prisma.box.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { code: 'asc' },
    }),
    getLatestRates(),
  ]);

  const stats = [
    { label: 'Krabice', value: boxCount, icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Kameny celkem', value: itemCount, icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
    { label: 'Na Eshopu', value: shopCount, icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z' },
    { label: 'Na Etsy', value: etsyCount, color: 'text-orange-400' },
    { label: 'Prodáno', value: soldCount, color: 'text-red-400' },
  ];

  const eurRate = rates.EUR;
  const usdRate = rates.USD;

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <div className="flex items-center gap-4">
            <p className="text-text-secondary">
              Bohemian Moldavite - evidence drahých kamenů
            </p>
            {isAdmin && <BackupButton />}
          </div>
        </div>

        {/* Exchange Rates */}
        <div className="bg-bg-card border border-border-color rounded-xl p-4 min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-text-muted uppercase tracking-wider">Kurzy ČNB</h3>
            <RefreshRatesButton />
          </div>
          <div className="space-y-2">
            {eurRate && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-400">EUR</span>
                </div>
                <span className="text-lg font-bold text-text-primary">
                  {eurRate.rate.toFixed(3)} <span className="text-sm text-text-muted font-normal">CZK</span>
                </span>
              </div>
            )}
            {usdRate && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-400">USD</span>
                </div>
                <span className="text-lg font-bold text-text-primary">
                  {usdRate.rate.toFixed(3)} <span className="text-sm text-text-muted font-normal">CZK</span>
                </span>
              </div>
            )}
          </div>
          {eurRate && (
            <p className="text-[10px] text-text-muted mt-2 border-t border-border-color pt-2">
              Aktualizováno: {eurRate.fetchedAt.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
          {!eurRate && !usdRate && (
            <p className="text-sm text-text-muted">Kurzy ještě nebyly načteny</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-bg-card border border-border-color rounded-xl p-5 hover:border-border-hover transition-colors"
          >
            <p className={`text-2xl font-bold ${'color' in stat ? stat.color : 'text-accent-gold'}`}>
              {stat.value}
            </p>
            <p className="text-xs text-text-secondary mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Box Grid */}
      <h2 className="text-xl font-semibold mb-4">Krabice</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boxes.map((box) => (
          <Link
            key={box.id}
            href={`/boxes/${box.id}`}
            className="bg-bg-card border border-border-color rounded-xl p-5 hover:border-moldavite-600 hover:bg-bg-card-hover transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent-gold transition-colors">
                {box.code}
              </h3>
              <span className="text-xs bg-moldavite-900 text-moldavite-300 px-2 py-1 rounded-full">
                {box._count.items} ks
              </span>
            </div>
            {box.name && (
              <p className="text-sm text-text-secondary">{box.name}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
