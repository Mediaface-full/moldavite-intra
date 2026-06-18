'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface Stats {
  overview: {
    totalItems: number; totalBoxes: number; inStock: number; sold: number;
    onShop: number; onEtsy: number; noPrice: number; noWeight: number; noDescription: number;
  };
  financial: {
    totalSaleValue: number; totalPurchaseValue: number; potentialProfit: number;
    soldRevenue: number; soldCost: number; soldProfit: number; avgPricePerGram: number;
  };
  inventory: {
    totalWeight: number;
    weightDistribution: Array<{ label: string; count: number }>;
  };
  monthlyData: Array<{ month: string; count: number; revenue: number; profit: number }>;
  boxBreakdown: Array<{
    code: string; total: number; sold: number; onShop: number; onEtsy: number;
    inStock: number; totalWeight: number; totalValue: number;
  }>;
  soldList: Array<{
    id: number; catalogNumber: string; salePrice: number; purchasePrice: number;
    profit: number; weight: number; soldAt: string;
  }>;
}

const fmt = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
const fmtCZK = (n: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0 }).format(n);

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    try {
      const res = await apiFetch(`/api/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch {} finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return <div className="text-muted-foreground">Načítám statistiky...</div>;
  if (!stats) return <div className="text-destructive">Chyba načítání</div>;

  const { overview: o, financial: f, inventory: inv } = stats;
  const maxWeight = Math.max(...inv.weightDistribution.map(w => w.count), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Statistiky</h1>
          <p className="text-muted-foreground mt-1">Přehled skladu a prodejů</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Od</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Do</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          </div>
          <button onClick={loadStats}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Filtrovat
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Kameny celkem" value={fmt(o.totalItems)} />
        <StatCard label="Na skladě" value={fmt(o.inStock)} color="text-foreground" />
        <StatCard label="Prodáno" value={fmt(o.sold)} color="text-destructive" />
        <StatCard label="Na eshopu" value={fmt(o.onShop)} color="text-primary" />
        <StatCard label="Na Etsy" value={fmt(o.onEtsy)} color="text-warning" />
      </div>

      {/* Financial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Sklad - hodnota</h3>
          <div className="space-y-3">
            <FinRow label="Nákupní hodnota skladu" value={fmtCZK(f.totalPurchaseValue)} />
            <FinRow label="Prodejní hodnota skladu" value={fmtCZK(f.totalSaleValue)} color="text-primary" />
            <FinRow label="Potenciální zisk" value={fmtCZK(f.potentialProfit)} color="text-primary" />
            <div className="border-t border-border pt-3">
              <FinRow label="Celková hmotnost na skladě" value={`${inv.totalWeight} g`} />
              <FinRow label="Průměrná cena za gram" value={fmtCZK(f.avgPricePerGram)} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Prodeje {dateFrom || dateTo ? '(filtrováno)' : ''}</h3>
          <div className="space-y-3">
            <FinRow label="Počet prodaných" value={fmt(o.sold)} />
            <FinRow label="Tržby" value={fmtCZK(f.soldRevenue)} color="text-primary" />
            <FinRow label="Náklady" value={fmtCZK(f.soldCost)} />
            <div className="border-t border-border pt-3">
              <FinRow label="Zisk z prodejů" value={fmtCZK(f.soldProfit)}
                color={f.soldProfit >= 0 ? 'text-primary' : 'text-destructive'} />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly sales chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-2">Vývoj prodejů (12 měsíců)</h3>
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> Počet prodaných</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning" /> Tržby</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-info" /> Zisk</span>
        </div>
        {(() => {
          const md = stats.monthlyData;
          const maxCount = Math.max(...md.map(m => m.count), 1);
          const maxRevenue = Math.max(...md.map(m => m.revenue), 1);
          const hasData = md.some(m => m.count > 0);

          return (
            <div>
              {/* Bar chart for counts */}
              <div className="flex items-end gap-1 h-36 mb-1">
                {md.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                    {m.count > 0 && (
                      <span className="text-[10px] text-primary font-medium">{m.count}</span>
                    )}
                    <div className="w-full flex gap-px justify-center" style={{ height: `${Math.max((m.count / maxCount) * 80, m.count > 0 ? 8 : 0)}%` }}>
                      <div className="flex-1 bg-primary rounded-t" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Revenue line */}
              {hasData && (
                <div className="flex items-end gap-1 h-20 mb-1 border-t border-border pt-2">
                  {md.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                      {m.revenue > 0 && (
                        <span className="text-[9px] text-primary">{Math.round(m.revenue / 1000)}k</span>
                      )}
                      <div className="w-full flex gap-px justify-center">
                        <div className="flex-1 bg-warning/60 rounded-t" style={{ height: `${Math.max((m.revenue / maxRevenue) * 80, m.revenue > 0 ? 8 : 0)}%` }} />
                        <div className="flex-1 bg-info/60 rounded-t" style={{ height: `${Math.max((m.profit / maxRevenue) * 80, m.profit > 0 ? 8 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Month labels */}
              <div className="flex gap-1">
                {md.map((m, i) => (
                  <div key={i} className="flex-1 text-center">
                    <span className="text-[9px] text-muted-foreground">{m.month.split('/')[0]}</span>
                  </div>
                ))}
              </div>

              {!hasData && (
                <p className="text-center text-muted-foreground text-sm mt-4">Zatím žádné prodeje</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Weight distribution */}
      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Rozložení hmotnosti (na skladě)</h3>
        <div className="flex items-end gap-3 h-32">
          {inv.weightDistribution.map(w => (
            <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-foreground font-medium">{w.count}</span>
              <div className="w-full bg-primary rounded-t"
                style={{ height: `${Math.max((w.count / maxWeight) * 100, 4)}%` }} />
              <span className="text-[10px] text-muted-foreground">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Completeness */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-2xl font-bold text-destructive">{o.noPrice}</p>
          <p className="text-xs text-muted-foreground mt-1">Bez prodejní ceny</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-2xl font-bold text-destructive">{o.noWeight}</p>
          <p className="text-xs text-muted-foreground mt-1">Bez hmotnosti</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-2xl font-bold text-warning">{o.noDescription}</p>
          <p className="text-xs text-muted-foreground mt-1">Bez popisu</p>
        </div>
      </div>

      {/* Box breakdown */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold">Kazety - přehled</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Kazety</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Celkem</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Na skladě</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Prodáno</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Eshop</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Etsy</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hmotnost</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hodnota</th>
            </tr>
          </thead>
          <tbody>
            {stats.boxBreakdown.map(box => (
              <tr key={box.code} className="border-b border-border hover:bg-muted/40">
                <td className="px-4 py-3 font-mono font-medium text-primary">{box.code}</td>
                <td className="px-4 py-3 text-right">{box.total}</td>
                <td className="px-4 py-3 text-right text-foreground font-medium">{box.inStock}</td>
                <td className="px-4 py-3 text-right text-destructive">{box.sold || '-'}</td>
                <td className="px-4 py-3 text-right text-primary">{box.onShop || '-'}</td>
                <td className="px-4 py-3 text-right text-warning">{box.onEtsy || '-'}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{box.totalWeight > 0 ? `${box.totalWeight.toFixed(1)}g` : '-'}</td>
                <td className="px-4 py-3 text-right text-foreground">{box.totalValue > 0 ? fmtCZK(box.totalValue) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sold items list */}
      {stats.soldList.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold">Prodané kameny {dateFrom || dateTo ? '(filtrováno)' : ''}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Kat. číslo</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Hmotnost</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Nákupní</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Prodejní</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Zisk</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {stats.soldList.map(item => (
                <tr key={item.id} className="border-b border-border hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs text-primary">{item.catalogNumber}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{item.weight > 0 ? `${item.weight}g` : '-'}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{item.purchasePrice > 0 ? fmtCZK(item.purchasePrice) : '-'}</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmtCZK(item.salePrice)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${item.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {fmtCZK(item.profit)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(item.soldAt).toLocaleDateString('cs-CZ')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted border-t border-border font-medium">
                <td className="px-4 py-3 text-muted-foreground">Celkem ({stats.soldList.length})</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {stats.soldList.reduce((s, i) => s + i.weight, 0).toFixed(1)}g
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {fmtCZK(stats.soldList.reduce((s, i) => s + i.purchasePrice, 0))}
                </td>
                <td className="px-4 py-3 text-right text-foreground">
                  {fmtCZK(stats.soldList.reduce((s, i) => s + i.salePrice, 0))}
                </td>
                <td className={`px-4 py-3 text-right ${f.soldProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {fmtCZK(f.soldProfit)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className={`text-2xl font-bold ${color || 'text-primary'}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function FinRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${color || 'text-foreground'}`}>{value}</span>
    </div>
  );
}
