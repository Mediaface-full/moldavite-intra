'use client';

import { useState } from 'react';
import { formatWeight } from '@/lib/utils';

type ItemSnapshot = {
  weight: string | null;
  purchasePrice: string;
  salePrice: string;
  manualPriceInclVatCzk: string | null;
  purchasePricePerGramCzk: string | null;
  pasShape: string | null;
  attrDamage: string | null;
  attrColor: string[];
  attrCollectible: boolean;
};

type StoneSteps = {
  purchasePriceCzk?: string;
  costBasisCzk?: string;
  totalMarginRate?: string;
  marginBreakdown?: Array<{ ruleKey: string; matched: string | null; marginRate: string }>;
  minPriceInclVatCzk?: string;
  recommendedPriceInclVatCzk?: string;
};

type StoneResult = {
  status?: string;
  steps?: StoneSteps | null;
  issues?: Array<{ severity: string; code: string; message: string }>;
};

type RuleSummary = { key: string; label?: string; type: string; source?: string };

type SaleSnapshot = {
  capturedAt: string;
  orderId: number | null;
  orderCode: string | null;
  pricingConfigId: number | null;
  pricingConfigName: string | null;
  rules: { version: number; rules: RuleSummary[] };
  stoneResult: StoneResult | null;
  itemSnapshot: ItemSnapshot;
};

export default function SaleSnapshotPanel({
  snapshot,
  capturedAt,
  soldAt,
}: {
  snapshot: SaleSnapshot;
  capturedAt: string | null;
  soldAt: string | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const steps = snapshot.stoneResult?.steps ?? null;
  const breakdown = steps?.marginBreakdown ?? [];
  const totalMarginPct = steps?.totalMarginRate ? (Number(steps.totalMarginRate) * 100).toFixed(1) : null;
  const captured = capturedAt ? new Date(capturedAt) : null;
  const sold = soldAt ? new Date(soldAt) : null;
  const it = snapshot.itemSnapshot;

  return (
    <div className="mt-6 bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}>
              PRODÁNO
            </span>
            Výpočet ceny v okamžiku prodeje
          </h3>
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            Tento záznam je <strong>zafixovaný</strong> — nepřepočítává se ani při změně cenotvorby.
            {sold && <> Prodáno {sold.toLocaleString('cs-CZ')}.</>}
            {captured && captured.getTime() !== sold?.getTime() && <> Zachyceno {captured.toLocaleString('cs-CZ')}.</>}
          </p>
        </div>
      </div>

      {/* Order context */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-[11px] font-mono">
        <Field label="Zakázka" value={snapshot.orderCode ?? '—'} />
        <Field label="Cenotvorba" value={snapshot.pricingConfigName ?? '— (žádná)'} />
        <Field label="Váha v okamžiku prodeje" value={formatWeight(it.weight)} />
        <Field label="Prodejní cena (CZK)" value={it.salePrice} />
      </div>

      {/* Pricing math */}
      {steps && (
        <div className="border border-border rounded-lg overflow-hidden mb-3">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border">
              <Row label="Nákupní cena" value={steps.purchasePriceCzk} />
              <Row label="+ Alokace nákladů zakázky" value={steps.costBasisCzk && steps.purchasePriceCzk ? (Number(steps.costBasisCzk) - Number(steps.purchasePriceCzk)).toFixed(2) : '—'} />
              <Row label="Cena s náklady" value={steps.costBasisCzk} bold />
              <Row label={`Marže (${totalMarginPct ?? '0'} %)`} value={steps.costBasisCzk && steps.totalMarginRate ? (Number(steps.costBasisCzk) * Number(steps.totalMarginRate)).toFixed(2) : '—'} />
              <Row label="Doporučená cena vč. DPH" value={steps.recommendedPriceInclVatCzk} bold />
            </tbody>
          </table>
        </div>
      )}

      {/* Rule breakdown */}
      {breakdown.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground font-mono mb-2">Rozpis pravidel cenotvorby:</p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/30">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-1.5">Pravidlo</th>
                  <th className="text-left px-3 py-1.5">Hodnota u kamene</th>
                  <th className="text-right px-3 py-1.5">Bonus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {breakdown.map((b, i) => {
                  const matched = b.matched !== null;
                  const pct = (Number(b.marginRate) * 100).toFixed(1);
                  const meta = snapshot.rules.rules[i];
                  const label = meta?.label?.trim() || b.ruleKey;
                  const src = meta?.source ? ` (${meta.source})` : '';
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <span>{label}</span>
                        <span className="text-muted-foreground text-[10px]">{src}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {matched ? (
                          <span style={{ color: 'var(--success)' }}>✓ {b.matched}</span>
                        ) : (
                          <span style={{ color: 'var(--warning)' }}>⚠ nematchlo</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">{matched ? `+${pct} %` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item attrs snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-[11px] font-mono">
        <Field label="Tvar" value={it.pasShape ?? '—'} />
        <Field label="Poškození" value={it.attrDamage ?? '—'} />
        <Field label="Barva" value={it.attrColor.length ? it.attrColor.join(', ') : '—'} />
        <Field label="Sbírkový" value={it.attrCollectible ? 'ano' : 'ne'} />
      </div>

      {/* Issues */}
      {snapshot.stoneResult?.issues && snapshot.stoneResult.issues.length > 0 && (
        <div className="mb-3 space-y-1">
          {snapshot.stoneResult.issues.map((iss, i) => (
            <p key={i} className="text-[11px] font-mono" style={{ color: iss.severity === 'error' ? 'var(--destructive)' : 'var(--warning)' }}>
              {iss.severity === 'error' ? '✕' : '⚠'} {iss.code}: {iss.message}
            </p>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline font-mono"
        >
          {showRaw ? '▾' : '▸'} Raw JSON snapshotu (kompletní záznam)
        </button>
        {showRaw && (
          <pre className="mt-2 text-[10px] font-mono bg-muted/40 border border-border rounded p-3 overflow-x-auto max-h-96">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string | undefined; bold?: boolean }) {
  return (
    <tr>
      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
      <td className={`px-3 py-1.5 text-right font-mono ${bold ? 'font-semibold' : ''}`}>{value ?? '—'}</td>
    </tr>
  );
}
