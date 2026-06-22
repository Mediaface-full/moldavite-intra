'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import { formatWeight } from '@/lib/utils';
import type { SerializedOrder, SerializedItem } from './OrderDetailClient';
import Icon, { type IconName } from '../Icon';

const STATUS_COLOR: Record<string, string> = {
  NEEDS_INPUT: 'var(--destructive)',
  NEEDS_REVIEW: 'var(--warning)',
  OK: 'var(--success)',
  STALE: 'var(--info)',
};
const STATUS_LABEL: Record<string, string> = {
  NEEDS_INPUT: 'Chybí vstupy',
  NEEDS_REVIEW: 'K revizi',
  OK: 'OK',
  STALE: 'Přepočítat',
};
const STATUS_ICON: Record<string, IconName> = {
  NEEDS_INPUT: 'error',
  NEEDS_REVIEW: 'warning',
  OK: 'ok',
  STALE: 'refresh',
};

function fmt(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  return `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
}

/**
 * Diagnostika proc kamen ma status NEEDS_INPUT — pro tooltip badge.
 * Sleduje stejny PPG fallback chain jako lib/pricing/resolve.ts:
 *   Item.PPG -> Box.PPG -> Box.amount/weight -> Order.defaultPPG
 * Vraci ['vaha', 'cena za gram', ...] — co konkretne chybi.
 */
function diagnoseNeedsInput(
  item: SerializedItem,
  order: SerializedOrder,
): string[] {
  const reasons: string[] = [];
  const weight = Number(item.weight ?? 0);
  if (!Number.isFinite(weight) || weight <= 0) {
    reasons.push('váha kamene');
  }
  // PPG fallback chain — pokud zadny zdroj nema kladnou hodnotu, chybi cena za gram
  const itemPpg = Number(item.purchasePricePerGramCzk ?? 0);
  if (itemPpg <= 0) {
    const box = order.boxes.find((b) => b.id === item.boxId);
    const boxPpg = Number(box?.purchasePricePerGramCzk ?? 0);
    const boxAmount = Number(box?.purchaseAmountCzk ?? 0);
    const boxDeclWeight = Number(box?.declaredWeight ?? 0);
    const orderPpg = Number(order.defaultPurchasePricePerGramCzk ?? 0);
    const orderAmount = Number(order.totalPurchaseAmountCzk ?? 0);
    const orderDeclWeight = Number(order.declaredWeight ?? 0);
    const hasBoxExplicit = boxPpg > 0;
    const hasBoxCompute = boxAmount > 0 && boxDeclWeight > 0;
    const hasOrderDefault = orderPpg > 0;
    const hasOrderCompute = orderAmount > 0 && orderDeclWeight > 0;
    if (!hasBoxExplicit && !hasBoxCompute && !hasOrderDefault && !hasOrderCompute) {
      reasons.push('cena za gram (Kč/g) — chybí na kameni, kazetě i zakázce');
    }
  }
  // Pricing rule s missingPolicy='error' nelze diagnostikovat bez snapshot
  // pravidel — pro vetsinu pripadu jsou problemy 1-2 vyse, zbytek catch-all.
  if (reasons.length === 0) {
    reasons.push('atribut s povinným pravidlem cenotvorby (např. tvar, barva)');
  }
  return reasons;
}

/**
 * Diagnostika proc kamen ma status NEEDS_REVIEW — pro tooltip badge.
 * Sleduje stejne pravidla jako lib/pricing/calculate.ts:
 *   - chybi povinne evidencni pole (tvar, poskozeni, barva, misto nalezu)
 *   - manualPrice < recommendedPrice
 */
function diagnoseNeedsReview(item: SerializedItem): string[] {
  const reasons: string[] = [];
  if (!item.pasShape) reasons.push('tvar');
  if (!item.attrDamage) reasons.push('poškození');
  if (!item.attrColor || item.attrColor.length === 0) reasons.push('barva');
  if (!item.location) reasons.push('místo nálezu');
  if (
    item.manualPriceInclVatCzk &&
    item.recommendedPriceInclVatCzk &&
    Number(item.manualPriceInclVatCzk) < Number(item.recommendedPriceInclVatCzk)
  ) {
    reasons.push(`speciální cena ${item.manualPriceInclVatCzk} < doporučená ${item.recommendedPriceInclVatCzk}`);
  }
  return reasons;
}

export default function OrderItemsTab({ order }: { order: SerializedOrder }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE'>('all');

  const filtered = filter === 'all' ? order.items : order.items.filter((i) => i.pricingStatus === filter);
  const counts = {
    all: order.items.length,
    NEEDS_INPUT: order.items.filter((i) => i.pricingStatus === 'NEEDS_INPUT').length,
    NEEDS_REVIEW: order.items.filter((i) => i.pricingStatus === 'NEEDS_REVIEW').length,
    OK: order.items.filter((i) => i.pricingStatus === 'OK').length,
    STALE: order.items.filter((i) => i.pricingStatus === 'STALE').length,
  };

  async function updateManualPrice(itemId: number, manualPrice: string | null) {
    const res = await apiFetch(`/api/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualPriceInclVatCzk: manualPrice === '' ? null : Number(manualPrice) }),
    });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      alert(`Uložení selhalo: ${data.error ?? res.status}`);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterChip label="Vše" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} icon="list" />
        <FilterChip label={STATUS_LABEL.NEEDS_INPUT} count={counts.NEEDS_INPUT} active={filter === 'NEEDS_INPUT'} onClick={() => setFilter('NEEDS_INPUT')} color={STATUS_COLOR.NEEDS_INPUT} icon={STATUS_ICON.NEEDS_INPUT} />
        <FilterChip label={STATUS_LABEL.STALE} count={counts.STALE} active={filter === 'STALE'} onClick={() => setFilter('STALE')} color={STATUS_COLOR.STALE} icon={STATUS_ICON.STALE} />
        <FilterChip label={STATUS_LABEL.NEEDS_REVIEW} count={counts.NEEDS_REVIEW} active={filter === 'NEEDS_REVIEW'} onClick={() => setFilter('NEEDS_REVIEW')} color={STATUS_COLOR.NEEDS_REVIEW} icon={STATUS_ICON.NEEDS_REVIEW} />
        <FilterChip label={STATUS_LABEL.OK} count={counts.OK} active={filter === 'OK'} onClick={() => setFilter('OK')} color={STATUS_COLOR.OK} icon={STATUS_ICON.OK} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">{filter === 'all' ? 'Žádné kameny v zakázce.' : 'Žádné kameny v tomto filtru.'}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kat. č.</th>
                <th className="text-right px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Váha (g)</th>
                <th className="text-right px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Alokace</th>
                <th className="text-right px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Doporučená</th>
                <th className="text-right px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider" title="Speciální cena — manuálně nastavená vyšší cena pro mimořádně pěkné kameny">Speciální</th>
                <th className="text-left px-3 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Stav</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <ItemRow key={it.id} item={it} boxCode={it.box.code} order={order} onSaveManual={(v) => updateManualPrice(it.id, v)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, color, icon }: { label: string; count: number; active: boolean; onClick: () => void; color?: string; icon?: IconName }) {
  return (
    <button
      onClick={onClick}
      style={active && color ? { color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors ${
        active
          ? color ? '' : 'bg-foreground text-background border-foreground'
          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
      }`}
    >
      {icon && <Icon name={icon} className="w-3 h-3" />}
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function ItemRow({ item, boxCode, order, onSaveManual }: { item: SerializedItem; boxCode: string; order: SerializedOrder; onSaveManual: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [manualValue, setManualValue] = useState(item.manualPriceInclVatCzk ?? '');
  const status = item.pricingStatus;
  const color = STATUS_COLOR[status];
  // Pro NEEDS_INPUT i NEEDS_REVIEW: rozepis konkretni problemy do tooltipu + pod badge
  const missingReasons =
    status === 'NEEDS_INPUT' ? diagnoseNeedsInput(item, order) :
    status === 'NEEDS_REVIEW' ? diagnoseNeedsReview(item) :
    null;
  const reasonPrefix = status === 'NEEDS_INPUT' ? 'Chybí' : status === 'NEEDS_REVIEW' ? 'K revizi' : '';
  const tooltipTitle = missingReasons && missingReasons.length > 0 ? `${reasonPrefix}: ${missingReasons.join(' · ')}` : undefined;
  const showReasonList = missingReasons && missingReasons.length > 0;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
      <td className="px-3 py-2">
        <Link href={`/items/${item.id}`} className="font-mono text-xs font-semibold text-foreground hover:text-primary transition-colors tracking-tight">
          {boxCode}-{item.evidNumber}
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{formatWeight(item.weight, { unit: 'none' })}</td>
      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{fmt(item.allocatedOrderCostCzk)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{fmt(item.recommendedPriceInclVatCzk)}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="inline-flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              autoFocus
              className="w-24 bg-muted border border-border rounded px-2 py-0.5 text-right text-xs font-mono focus:outline-none focus:border-ring"
            />
            <button
              onClick={async () => { await onSaveManual(manualValue); setEditing(false); }}
              className="text-[10px] font-mono uppercase tracking-wider text-success hover:opacity-80"
            >
              ✓
            </button>
            <button
              onClick={() => { setEditing(false); setManualValue(item.manualPriceInclVatCzk ?? ''); }}
              className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ✗
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="font-mono text-xs hover:text-primary transition-colors">
            {item.manualPriceInclVatCzk ? fmt(item.manualPriceInclVatCzk) : <span className="text-muted-foreground/60">—</span>}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          title={tooltipTitle}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${showReasonList ? 'cursor-help' : ''}`}
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        >
          <Icon name={STATUS_ICON[status]} className="w-3 h-3" />
          {STATUS_LABEL[status]}
        </span>
        {showReasonList && (
          <div className="text-[10px] font-mono text-muted-foreground mt-1 leading-snug max-w-[200px]">
            {missingReasons.map((r, i) => (
              <div key={i}>• {r}</div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
