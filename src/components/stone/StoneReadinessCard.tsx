'use client';

/** Kontrola připravenosti (§4 D) — vždy viditelný checklist se skóre; ✗ odskroluje na sekci. */
import { useMemo } from 'react';
import { computeReadiness, type ItemMediaInfo } from '@/lib/itemReadiness';
import Icon from '../Icon';
import { useItemForm } from './ItemFormProvider';

export default function StoneReadinessCard({ media }: { media: ItemMediaInfo }) {
  const { item, formData } = useItemForm();
  const readiness = useMemo(() => computeReadiness({
    name: formData.name, description: formData.description, descriptionEn: formData.descriptionEn,
    longDescription: formData.longDescription, longDescriptionEn: formData.longDescriptionEn,
    pasShape: formData.pasShape, attrDamage: formData.attrDamage, attrColor: formData.attrColor,
    location: formData.location, weight: formData.weight,
    pricingStatus: item.pricingStatus, onShop: formData.onShop, onEtsy: formData.onEtsy,
    certHash: item.certHash, media,
  }), [formData, item.pricingStatus, item.certHash, media]);

  const pct = readiness.total ? readiness.score / readiness.total : 0;
  const color = pct === 1 ? 'var(--success)' : pct >= 0.6 ? 'var(--warning)' : 'var(--destructive)';

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-foreground uppercase tracking-[0.15em] font-mono font-semibold">Připravenost</p>
        <span className="font-mono font-semibold text-sm tabular-nums" style={{ color }}>{readiness.score} / {readiness.total}</span>
      </div>
      <div className="h-1 rounded bg-muted mb-3 overflow-hidden"><div className="h-full rounded transition-all" style={{ width: `${pct * 100}%`, background: color }} /></div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {readiness.items.map((r) => (
          <li key={r.key} className="min-w-0">
            <a
              href={r.anchor ? `#${r.anchor}` : undefined}
              className={`flex items-center gap-1.5 text-[12px] leading-5 min-w-0 ${r.ok ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title={r.optional ? `${r.detail ? `${r.detail} · ` : ''}volitelné — nepočítá se do skóre` : r.detail}
            >
              {/* volitelná položka (video): chybí = šedá pomlčka, ne červený křížek; do skóre se nepočítá */}
              <Icon name={r.ok ? 'ok' : r.optional ? 'minus' : 'x'} className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: r.ok ? 'var(--success)' : r.optional ? 'var(--muted-foreground)' : 'var(--destructive)' }} />
              <span className="truncate">{r.label}{r.detail && r.ok && r.key === 'photos' ? ` ${r.detail}` : ''}{r.optional && !r.ok ? <span className="text-[10px] text-muted-foreground"> · volitelné</span> : null}</span>
            </a>
          </li>
        ))}
      </ul>
      {readiness.items.some((r) => !r.ok && r.detail && r.key !== 'photos' && r.key !== 'shop' && r.key !== 'etsy') && (
        <p className="mt-2 text-[11px] text-muted-foreground font-mono leading-snug">
          {readiness.items.filter((r) => !r.ok && r.detail && !['photos', 'shop', 'etsy'].includes(r.key)).map((r) => `${r.label}: ${r.detail}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
