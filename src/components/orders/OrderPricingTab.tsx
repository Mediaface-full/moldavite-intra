'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import type { SerializedOrder } from './OrderDetailClient';

type MarginBreakdownRow = { ruleKey: string; matched: string | null; marginRate: string };
type RecalcPerStone = {
  stoneId: number;
  status: string;
  steps: {
    purchasePriceCzk: string;
    costBasisCzk: string;
    totalMarginRate: string;
    marginBreakdown: MarginBreakdownRow[];
    minPriceInclVatCzk: string;
    recommendedPriceInclVatCzk: string;
  } | null;
  finalInternalPriceInclVatCzk: string | null;
  issues: Array<{ severity: string; code: string; message: string }>;
};
type RecalcResponse = {
  perStone: RecalcPerStone[];
  warnings: Array<{ code: string; message: string }>;
  items: Array<{ id: number; evidNumber: string; name: string; weight: string | null; attrDamage: string | null }>;
  snapshotRaceNotice?: string;
};

export default function OrderPricingTab({
  order,
  pricingConfigs,
}: {
  order: SerializedOrder;
  pricingConfigs: Array<{ id: number; name: string; active: boolean }>;
}) {
  const router = useRouter();
  const [allocation, setAllocation] = useState(order.allocationMethod);
  const [vat, setVat] = useState(order.vatRatePct ?? '21');
  const [step, setStep] = useState(String(order.roundingStep));
  const [defaultPpg, setDefaultPpg] = useState(order.defaultPurchasePricePerGramCzk ?? '');
  const [configId, setConfigId] = useState<string>(order.pricingConfigId?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [recalcResult, setRecalcResult] = useState<RecalcResponse | null>(null);
  const [expandedStoneId, setExpandedStoneId] = useState<number | null>(null);
  const dirty =
    allocation !== order.allocationMethod ||
    vat !== (order.vatRatePct ?? '21') ||
    step !== String(order.roundingStep) ||
    defaultPpg !== (order.defaultPurchasePricePerGramCzk ?? '') ||
    (configId === '' ? null : parseInt(configId, 10)) !== order.pricingConfigId;

  async function handleSave() {
    setSaving(true);
    const res = await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocationMethod: allocation,
        vatRatePct: Number(vat),
        roundingStep: parseInt(step, 10),
        defaultPurchasePricePerGramCzk: defaultPpg === '' ? null : Number(defaultPpg),
        defaultPurchasePricePerGramSource: defaultPpg === '' ? null : Number(defaultPpg),
        pricingConfigId: configId === '' ? null : parseInt(configId, 10),
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Uložení selhalo: ${data.error ?? res.status}`);
    }
  }

  async function handleRecalculate() {
    if (dirty) {
      if (!confirm('Máš neuložené změny v cenotvorbě. Uložit a přepočítat?')) return;
      await handleSave();
    }
    const res = await apiFetch(`/api/orders/${order.id}/recalculate`, { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as RecalcResponse;
      setRecalcResult(data);
      if (data.snapshotRaceNotice) {
        alert(data.snapshotRaceNotice);
      }
      router.refresh();
    } else {
      alert('Přepočet selhal');
    }
  }

  const inputCls = 'w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';
  const labelCls = 'block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono';

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Cenotvorba zakázky</h3>
          {order.lastCalculatedAt && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Naposledy přepočítáno: {new Date(order.lastCalculatedAt).toLocaleString('cs-CZ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Alokace nákladů (default zakázky)</label>
            <select value={allocation} onChange={(e) => setAllocation(e.target.value as typeof allocation)} className={inputCls}>
              <option value="BY_WEIGHT">Podle gramáže (default)</option>
              <option value="BY_PURCHASE_PRICE">Podle nákupní ceny</option>
              <option value="EQUAL_PER_PIECE">Rovnoměrně na kus</option>
            </select>
            <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
              Jednotlivé náklady mohou mít vlastní override (záložka Náklady).
            </p>
          </div>

          <div>
            <label className={labelCls}>Default cena za gram (CZK)</label>
            <input
              type="number"
              step="0.01"
              value={defaultPpg}
              onChange={(e) => setDefaultPpg(e.target.value)}
              placeholder="např. 180"
              className={inputCls}
            />
            <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
              Použije se pro kameny, které nemají vlastní PPG. Bez hodnoty = kameny půjdou do NEEDS_INPUT.
            </p>
          </div>

          <div>
            <label className={labelCls}>DPH (%)</label>
            <input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Zaokrouhlení (Kč)</label>
            <select value={step} onChange={(e) => setStep(e.target.value)} className={inputCls}>
              <option value="10">10 Kč</option>
              <option value="50">50 Kč</option>
              <option value="100">100 Kč</option>
              <option value="1">1 Kč (bez zaokrouhlení)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={labelCls}>Konfigurace marží</label>
            <select value={configId} onChange={(e) => setConfigId(e.target.value)} className={inputCls}>
              <option value="">— Žádná (jen nákup + alokace + DPH bez marže) —</option>
              {pricingConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.active ? '  ✓ aktivní (default pro nové zakázky)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground font-mono mt-1.5 leading-relaxed">
              Nové zakázky automaticky dostanou <strong>aktivní</strong> konfiguraci (jedna z všech v /admin/pricing-config může být označena jako aktivní). Tady ji můžeš pro tuto zakázku přepsat.{' '}
              <Link href="/admin/pricing-config" className="text-primary hover:underline">Spravovat konfigurace →</Link>
              <br />
              <strong>Snapshot</strong> se uloží při přepočtu — pozdější změny v PricingConfig <em>nezasáhnou</em> tuto zakázku, dokud znova nepřepočítáš.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            {saving ? 'Ukládám…' : 'Uložit'}
          </button>
          <button
            onClick={handleRecalculate}
            disabled={saving}
            style={{
              color: 'var(--success)',
              borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
            }}
            className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Přepočítat zakázku
          </button>
          {dirty && <span className="text-[10px] font-mono text-warning">⚠ Neuložené změny</span>}
        </div>
      </div>

      {recalcResult && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Detail posledního výpočtu</h3>
            <span className="text-[10px] text-muted-foreground font-mono">
              {recalcResult.perStone.length} kamenů · klikni na řádek pro rozpis pravidel
            </span>
          </div>

          {recalcResult.warnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {recalcResult.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-warning font-mono">⚠ {w.message}</p>
              ))}
            </div>
          )}

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2">Kámen</th>
                  <th className="text-right px-3 py-2">Nákup</th>
                  <th className="text-right px-3 py-2">+ Náklady</th>
                  <th className="text-right px-3 py-2">Marže</th>
                  <th className="text-right px-3 py-2">Doporučená</th>
                  <th className="text-center px-3 py-2 w-16">Stav</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recalcResult.perStone.map((stone) => {
                  const item = recalcResult.items.find((i) => i.id === stone.stoneId);
                  const expanded = expandedStoneId === stone.stoneId;
                  const marginPct = stone.steps ? (Number(stone.steps.totalMarginRate) * 100).toFixed(1) : '—';
                  return (
                    <Fragment key={stone.stoneId}>
                      <tr
                        onClick={() => setExpandedStoneId(expanded ? null : stone.stoneId)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-3 py-2 font-mono">
                          {item?.evidNumber ?? `#${stone.stoneId}`}
                          {item?.name && <span className="text-muted-foreground ml-1.5">{item.name}</span>}
                        </td>
                        <td className="text-right px-3 py-2 font-mono">{stone.steps?.purchasePriceCzk ?? '—'}</td>
                        <td className="text-right px-3 py-2 font-mono">{stone.steps?.costBasisCzk ?? '—'}</td>
                        <td className="text-right px-3 py-2 font-mono">{marginPct === '—' ? '—' : `+${marginPct} %`}</td>
                        <td className="text-right px-3 py-2 font-mono font-semibold">{stone.steps?.recommendedPriceInclVatCzk ?? '—'}</td>
                        <td className="text-center px-3 py-2">
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              background:
                                stone.status === 'OK'
                                  ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                                  : 'color-mix(in srgb, var(--warning) 15%, transparent)',
                              color: stone.status === 'OK' ? 'var(--success)' : 'var(--warning)',
                            }}
                          >
                            {stone.status}
                          </span>
                        </td>
                      </tr>
                      {expanded && stone.steps && (
                        <tr className="bg-muted/10">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="text-[11px] space-y-2">
                              <div className="font-mono text-muted-foreground">
                                Rozpis pravidel cenotvorby (jak vzniklo +{marginPct} % marže):
                              </div>
                              {stone.steps.marginBreakdown.length === 0 ? (
                                <p className="text-muted-foreground italic">Žádná pravidla v cenotvorbě.</p>
                              ) : (
                                <table className="w-full font-mono">
                                  <thead>
                                    <tr className="text-[10px] text-muted-foreground uppercase">
                                      <th className="text-left">Pravidlo</th>
                                      <th className="text-left">Hodnota u kamene</th>
                                      <th className="text-right">Bonus</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {stone.steps.marginBreakdown.map((b, i) => {
                                      const pct = (Number(b.marginRate) * 100).toFixed(1);
                                      const matched = b.matched !== null;
                                      return (
                                        <tr key={i} className="border-t border-border/40">
                                          <td className="py-1">{b.ruleKey}</td>
                                          <td className="py-1">
                                            {matched ? (
                                              <span style={{ color: 'var(--success)' }}>✓ {b.matched}</span>
                                            ) : (
                                              <span style={{ color: 'var(--warning)' }}>⚠ NEMATCHLO (žádný bonus)</span>
                                            )}
                                          </td>
                                          <td className="py-1 text-right">{matched ? `+${pct} %` : '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {stone.issues.length > 0 && (
                                <div className="pt-2 border-t border-border/40 space-y-1">
                                  {stone.issues.map((iss, i) => (
                                    <p key={i} className="text-[11px]" style={{ color: iss.severity === 'error' ? 'var(--destructive)' : 'var(--warning)' }}>
                                      {iss.severity === 'error' ? '✕' : '⚠'} {iss.code}: {iss.message}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {item?.attrDamage !== undefined && (
                                <p className="text-[10px] text-muted-foreground pt-1">
                                  Aktuální Poškození u kamene: <code>{item.attrDamage || '—'}</code>
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
