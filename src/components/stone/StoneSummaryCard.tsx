'use client';

/** Sticky souhrn (§4 C) — živé hodnoty z formuláře, čtyři bloky oddělené linkou. */
import { getPasShape } from '@/lib/pasShapes';
import { computeSizeCategory, SIZE_CATEGORY_COLOR } from '@/lib/sizeCategory';
import { useItemForm } from './ItemFormProvider';
import { StatusBadge, fmtCzk, fmtDate } from './primitives';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

export default function StoneSummaryCard() {
  const { item, formData, catalogNumber, vatRate } = useItemForm();
  const w = Number(formData.weight);
  const hasW = Number.isFinite(w) && w > 0;
  const size = computeSizeCategory(formData.weight);
  const shape = getPasShape(formData.pasShape);
  const usedPpg = hasW && Number(formData.purchasePrice) > 0 ? (Number(formData.purchasePrice) / w).toFixed(0) : null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-foreground uppercase tracking-[0.15em] font-mono font-semibold">Souhrn</p>
        <span className="font-mono text-sm text-foreground">{catalogNumber}</span>
      </div>

      <div className="divide-y divide-border">
        <div className="py-2">
          <p className="text-[22px] font-semibold tabular-nums leading-tight">
            {hasW ? `${w.toFixed(2)} g` : <span className="text-muted-foreground">— g</span>}
            {hasW && <span className="text-sm text-muted-foreground font-normal ml-2">{(w * 5).toFixed(2)} ct</span>}
            {size && <span className="ml-2 align-middle inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border" style={{ color: SIZE_CATEGORY_COLOR[size], borderColor: `color-mix(in srgb, ${SIZE_CATEGORY_COLOR[size]} 35%, transparent)` }}>{size}</span>}
          </p>
          <Row label="Naleziště">{formData.location || <span className="text-muted-foreground">—</span>}</Row>
          <Row label="Tvar">{shape ? shape.cz : formData.pasShape || <span className="text-muted-foreground">—</span>}</Row>
          <Row label="Barva">{formData.attrColor.length ? formData.attrColor.join(', ') : <span className="text-muted-foreground">—</span>}</Row>
          <Row label="Poškození">{formData.attrDamage || <span className="text-muted-foreground">—</span>}</Row>
          <Row label="Sbírkový">{formData.attrCollectible ? <span style={{ color: 'var(--warning)' }}>ano</span> : 'ne'}</Row>
        </div>

        <div className="py-2">
          <Row label="Nákup">
            <span className="tabular-nums">{fmtCzk(formData.purchasePrice)}</span>
            {usedPpg && <span className="text-[11px] text-muted-foreground font-mono ml-1.5">({usedPpg} Kč/g)</span>}
          </Row>
          <Row label="Doporučená"><span className="tabular-nums">{fmtCzk(item.recommendedPriceInclVatCzk)}</span>{vatRate > 0 && <span className="text-[11px] text-muted-foreground ml-1">s DPH</span>}</Row>
          {Number(formData.manualPriceInclVatCzk) > 0 && (
            <Row label="Speciální"><span className="tabular-nums">{fmtCzk(formData.manualPriceInclVatCzk)}</span></Row>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <span className="text-[11px] uppercase tracking-wider font-mono font-semibold" style={{ color: 'var(--success)' }}>Finální</span>
            <span className="text-[22px] font-semibold tabular-nums" style={{ color: 'var(--success)' }}>{fmtCzk(Number(item.finalInternalPriceInclVatCzk ?? 0) > 0 ? item.finalInternalPriceInclVatCzk : formData.salePrice)}</span>
          </div>
          {(Number(item.priceEUR) > 0 || Number(item.priceUSD) > 0) && (
            <p className="text-sm text-text-2 font-mono font-medium text-right tabular-nums">
              {Number(item.priceEUR) > 0 && `${Math.round(item.priceEUR!)} €`}{Number(item.priceEUR) > 0 && Number(item.priceUSD) > 0 && ' · '}{Number(item.priceUSD) > 0 && `${Math.round(item.priceUSD!)} $`}
            </p>
          )}
        </div>

        <div className="pt-2.5 flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={formData.onShop ? 'ok' : 'neutral'} title={item.onShopAt ? `od ${fmtDate(item.onShopAt)}` : undefined}>E-shop {formData.onShop ? '✓' : '—'}</StatusBadge>
          <StatusBadge tone={formData.onEtsy ? 'warn' : 'neutral'} title={item.onEtsyAt ? `od ${fmtDate(item.onEtsyAt)}` : undefined}>Etsy {formData.onEtsy ? '✓' : '—'}</StatusBadge>
          <StatusBadge tone={formData.sold ? 'danger' : 'neutral'}>{formData.sold ? 'Prodáno' : 'Neprodáno'}</StatusBadge>
        </div>
      </div>
    </div>
  );
}
