'use client';

/**
 * Sekce 4 — Cenotvorba ve třech sloupcích Vstupy → Výpočet → Výsledek (§4 D4).
 * Výpočetní logika (DPH konverze speciální ceny, lokální raw stav, „pod
 * doporučenou") je přenesená z původního PriceSection beze změny.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseDecimalCs } from '@/lib/utils';
import Icon from '../Icon';
import SaleSnapshotPanel from '../SaleSnapshotPanel';
import { useItemForm } from './ItemFormProvider';
import { SectionCard, StatusBadge, PriceFigure, fmtCzk, computedBox } from './primitives';

const STATUS_META = {
  NEEDS_INPUT: { label: 'Bez vstupů', tone: 'danger' as const, icon: 'pending' as const },
  NEEDS_REVIEW: { label: 'K revizi', tone: 'warn' as const, icon: 'warning' as const },
  STALE: { label: 'Zastaralé', tone: 'info' as const, icon: 'warning' as const },
  OK: { label: 'Spočítáno', tone: 'ok' as const, icon: 'ok' as const },
};

/**
 * Krok cenotvorby: vlastní panel s číslem kroku; mezi kroky výrazná šipka
 * (plný kruh, sedí v mezeře gridu `md:gap-7` → `-right-7`). Výsledek má
 * coral obrys, aby bylo na první pohled vidět, kde se čte finální cena.
 */
function Col({ step, title, arrow, result, children }: {
  step: number; title: string; arrow?: boolean; result?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`relative min-w-0 rounded-xl border p-4 ${result ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30'}`}>
      <p className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono font-semibold ${result ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}`}>{step}</span>
        <span className="text-xs text-foreground uppercase tracking-[0.15em] font-mono font-semibold">{title}</span>
      </p>
      <div className="space-y-3">{children}</div>
      {arrow && (
        <span aria-hidden className="hidden md:flex absolute top-3 -right-7 z-10 h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm ring-4 ring-card">
          <Icon name="arrow-right" className="w-4 h-4" />
        </span>
      )}
    </div>
  );
}

function Line({ label, value, hint, muted }: { label: string; value: string; hint?: React.ReactNode; muted?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">{label}</p>
      <p className={`font-mono text-base ${muted ? 'text-muted-foreground' : 'text-foreground'} tabular-nums`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{hint}</p>}
    </div>
  );
}

export default function StonePricingSection() {
  const { item, formData, setField, vatRate } = useItemForm();
  const vatMultiplier = 1 + vatRate / 100;

  const purchase = Number(formData.purchasePrice);
  const w = Number(formData.weight);
  const usedPpg = w > 0 && purchase > 0 ? (purchase / w).toFixed(2) : null;
  const ppgOverride = formData.purchasePricePerGramCzk && Number(formData.purchasePricePerGramCzk) > 0 ? formData.purchasePricePerGramCzk : null;
  const costBasis = Number(item.costBasisCzk ?? 0);
  const alloc = costBasis > 0 && purchase > 0 ? Math.max(costBasis - purchase, 0) : 0;
  const rec = Number(item.recommendedPriceInclVatCzk ?? 0);
  const exVatStored = item.computedMinPriceExVatCzk ? Number(item.computedMinPriceExVatCzk) : null;
  const exVat = exVatStored && exVatStored > 0 ? exVatStored : rec > 0 ? rec / vatMultiplier : 0;
  const vatAmount = rec - exVat;
  const sale = Number(formData.salePrice);
  const saleMatches = sale > 0 && rec > 0 && Math.abs(sale - rec) < 0.5;

  // Speciální cena: UI zadává BEZ DPH, DB drží S DPH (manualPriceInclVatCzk). Raw stav + commit na blur.
  const manualNum = Number(formData.manualPriceInclVatCzk);
  const manualExVat = Number.isFinite(manualNum) && manualNum > 0 ? manualNum / vatMultiplier : 0;
  const manualBelow = Number.isFinite(manualNum) && manualNum > 0 && rec > 0 && manualNum < rec;
  const [manualRaw, setManualRaw] = useState<string>(manualExVat > 0 ? manualExVat.toFixed(2) : '');
  useEffect(() => {
    const parsedRaw = parseDecimalCs(manualRaw);
    if (Number.isFinite(parsedRaw) && Math.abs(parsedRaw - manualExVat) < 0.005) return;
    setManualRaw(manualExVat > 0 ? manualExVat.toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.manualPriceInclVatCzk]);
  function commitManual() {
    const raw = manualRaw.trim();
    if (raw === '') { if (formData.manualPriceInclVatCzk !== '') setField('manualPriceInclVatCzk', ''); return; }
    const n = parseDecimalCs(raw);
    if (!Number.isFinite(n) || n <= 0) { setManualRaw(manualExVat > 0 ? manualExVat.toFixed(2) : ''); return; }
    setField('manualPriceInclVatCzk', (n * vatMultiplier).toFixed(2));
    setManualRaw(n.toFixed(2));
  }

  const status = item.pricingStatus ? STATUS_META[item.pricingStatus] : null;
  const breakdown = parseBreakdown(item.priceCalcBreakdown);

  return (
    <SectionCard id="pricing" number={4} title="Cenotvorba" icon="calc"
      description={`DPH ${vatRate} % ze zakázky. Vstupy → výpočet cenotvorbou zakázky → výsledná cena pro e-shop a Etsy.`}
      actions={<>
        {status && <StatusBadge tone={status.tone} icon={status.icon}>{status.label}</StatusBadge>}
        {item.order && <Link href={`/orders/${item.order.id}`} className="text-[11px] font-mono uppercase tracking-wider text-text-2 font-medium hover:text-foreground">Zakázka {item.order.code} ↗</Link>}
      </>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-7">
        <Col step={1} title="Vstupy" arrow>
          <Line label="Cena nákupní" value={fmtCzk(purchase)} hint={purchase > 0 ? 'váha × Kč/g' : 'spočítá se po přepočtu zakázky'} />
          <Line label="Kč / g" value={ppgOverride ? `${ppgOverride} Kč/g` : usedPpg ? `${usedPpg} Kč/g` : '—'}
            hint={ppgOverride ? 'override na kameni' : 'dědí se z kazety / zakázky — mění se v cenotvorbě zakázky'} />
          <Line label="Cena s náklady" value={fmtCzk(costBasis)} muted
            hint={costBasis > 0 ? (alloc > 0 ? `${fmtCzk(purchase)} + ${fmtCzk(alloc)} alokace nákladů` : 'bez alokace nákladů') : 'spočítá se po přepočtu'} />
        </Col>

        <Col step={2} title="Výpočet" arrow>
          <Line label="Min. prodejní bez DPH" value={exVat > 0 ? fmtCzk(exVat) : '—'} muted />
          <PriceFigure label="Doporučená s DPH" value={fmtCzk(rec)} caption={vatAmount > 0 ? `${fmtCzk(exVat)} + ${fmtCzk(vatAmount)} DPH` : undefined} />
          {breakdown && (
            <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1">Marže podle pravidel</p>
              <ul className="space-y-0.5">
                {breakdown.rules.map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate"><span className="text-muted-foreground">{r.label}:</span> <span className={r.noMatch ? 'italic text-muted-foreground' : ''}>{r.matched}</span></span>
                    <span className="font-mono whitespace-nowrap">{r.pct}</span>
                  </li>
                ))}
              </ul>
              {breakdown.total && <p className="mt-1 pt-1 border-t border-border/60 flex justify-between text-[11px]"><span className="text-muted-foreground">Celkem</span><span className="font-mono font-semibold">{breakdown.total}</span></p>}
              {breakdown.onDemand && <p className="mt-1 text-[9px] text-muted-foreground italic">Z aktuální cenotvorby — pro uložení spusť „Přepočítat“.</p>}
            </div>
          )}
        </Col>

        <Col step={3} title="Výsledek" result>
          <div>
            <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">Cena speciální (bez DPH)</p>
            <input type="text" inputMode="decimal" value={manualRaw} onChange={(e) => setManualRaw(e.target.value)} onBlur={commitManual}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="—"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 h-10 text-base font-mono font-semibold text-right text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {manualNum > 0 ? `= ${fmtCzk(manualNum)} s DPH (× ${vatMultiplier.toFixed(2)})` : 'override pro výjimečné kusy, musí být ≥ doporučená'}
            </p>
            {manualBelow && <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--warning)' }}>⚠ pod doporučenou — kámen bude K REVIZI</p>}
          </div>
          <div className={`${computedBox} justify-between h-auto py-2 text-sm`} title="Speciální cena s DPH — dopočteno">
            <span className="text-[11px] uppercase tracking-wider font-medium text-text-2">Speciální s DPH</span>
            <span>{manualNum > 0 ? fmtCzk(manualNum) : '—'}</span>
          </div>
          <PriceFigure label="Finální cena s DPH" value={fmtCzk(sale)} tone="ok" size="lg"
            caption={saleMatches ? `✓ odpovídá doporučené` : rec > 0 && sale > 0 ? `doporučená ${fmtCzk(rec)}` : 'spočítá se po přepočtu zakázky'}
            extra={(Number(item.priceEUR) > 0 || Number(item.priceUSD) > 0) ? (
              <p className="mt-1 flex gap-2 text-[11px] font-mono">
                {Number(item.priceEUR) > 0 && <span className="bg-muted border border-border rounded px-2 py-0.5"><span style={{ color: 'var(--info)' }}>EUR</span> {Math.round(item.priceEUR!)}</span>}
                {Number(item.priceUSD) > 0 && <span className="bg-muted border border-border rounded px-2 py-0.5"><span style={{ color: 'var(--success)' }}>USD</span> {Math.round(item.priceUSD!)}</span>}
              </p>
            ) : undefined} />
        </Col>
      </div>

      {item.sold && item.priceCalcSnapshot ? (
        <div className="mt-5 pt-5 border-t border-border/60">
          <SaleSnapshotPanel snapshot={item.priceCalcSnapshot as never} capturedAt={item.priceCalcSnapshotAt ?? null} soldAt={item.soldAt ?? null} />
        </div>
      ) : null}
    </SectionCard>
  );
}

const FRIENDLY_KEY: Record<string, string> = {
  weightBracket: 'Hmotnost', pasShape: 'Tvar', location: 'Místo nálezu', attrDamage: 'Poškození', attrColor: 'Barva', attrCollectible: 'Sbírkový kámen',
};

function parseBreakdown(breakdown: unknown): { rules: Array<{ label: string; matched: string; noMatch: boolean; pct: string }>; total: string | null; onDemand: boolean } | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const b = breakdown as {
    marginBreakdown?: Array<{ ruleKey: string; ruleLabel?: string | null; ruleType?: string; matched: string | null; marginRate: string }>;
    totalMarginRate?: string; computedOnDemand?: boolean;
  };
  const rules = Array.isArray(b.marginBreakdown) ? b.marginBreakdown : [];
  if (rules.length === 0) return null;
  const fmtPct = (rate: string) => { const n = Number(rate); if (!Number.isFinite(n)) return rate; const p = n * 100; return `${p >= 0 ? '+' : ''}${p.toFixed(0)} %`; };
  return {
    rules: rules.map((r) => {
      const noMatch = r.matched === null || r.matched === '';
      let matched = r.matched ?? '';
      if (noMatch) matched = r.ruleType === 'boolean' ? 'ne' : r.ruleType === 'multi-category' ? 'nevybráno' : 'nevyplněno';
      else if (r.ruleType === 'boolean') matched = r.matched === 'true' ? 'ano' : 'ne';
      return { label: r.ruleLabel || FRIENDLY_KEY[r.ruleKey] || r.ruleKey, matched, noMatch, pct: fmtPct(r.marginRate) };
    }),
    total: b.totalMarginRate ? fmtPct(b.totalMarginRate) : null,
    onDemand: !!b.computedOnDemand,
  };
}
