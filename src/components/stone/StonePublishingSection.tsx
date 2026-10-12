'use client';

/** Sekce 5 — Prodej a kanály: tři karty (Prodej / E-shop / Etsy) + audit řádek. Důvod blokace viditelně v kartě. */
import Icon from '../Icon';
import { useItemForm } from './ItemFormProvider';
import { SectionCard, Switch, fmtCzk, fmtDate } from './primitives';

function ChannelCard({ title, color, on, blocked, blockedTitle, at, priceLine, onToggle, label }: {
  title: string; color: string; on: boolean; blocked: boolean; blockedTitle?: string; at: string | null; priceLine: string; onToggle: () => void; label: string;
}) {
  const active = on && !blocked;
  return (
    <div className="rounded-lg border p-3 transition-colors relative overflow-hidden"
      style={active ? { background: `color-mix(in srgb, ${color} 10%, transparent)`, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` } : { background: 'color-mix(in srgb, var(--muted) 50%, transparent)', borderColor: 'var(--border)' }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: active ? color : 'var(--border)' }} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">{title}</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: active ? color : undefined }}>
            {active ? 'Vystaveno' : 'Nevystaveno'}{active && at ? <span className="text-[11px] font-normal text-muted-foreground font-mono ml-2">od {at}</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono mt-1">{priceLine}</p>
          {blocked && <p className="text-[10px] font-mono mt-1.5 leading-snug" style={{ color: 'var(--warning)' }}>{blockedTitle}</p>}
        </div>
        <Switch on={on} disabled={blocked} color={color} title={blockedTitle} label={label} onToggle={onToggle} />
      </div>
    </div>
  );
}

export default function StonePublishingSection() {
  const { item, formData, setField, publishBlocked, blockedTitle, vatRate } = useItemForm();
  const saleIncl = Number(formData.salePrice ?? 0);
  const saleEx = saleIncl > 0 ? saleIncl / (1 + vatRate / 100) : 0;
  const priceLine = vatRate > 0 ? `${fmtCzk(saleEx)} bez DPH · ${fmtCzk(saleIncl)} s DPH` : fmtCzk(saleIncl);

  return (
    <SectionCard id="publishing" number={5} title="Prodej a kanály" icon="cart" description="Vystavení jde až po spočítání ceny. Prodej zafixuje výpočet ceny pro audit.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 relative overflow-hidden"
          style={formData.sold ? { background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' } : { background: 'color-mix(in srgb, var(--muted) 50%, transparent)', borderColor: 'var(--border)' }}>
          <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: formData.sold ? 'var(--destructive)' : 'var(--border)' }} />
          <div className="pl-1">
            <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">Prodej</p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: formData.sold ? 'var(--destructive)' : undefined }}>
              {formData.sold ? 'Prodáno' : 'Neprodáno'}{formData.sold && item.soldAt ? <span className="text-[11px] font-normal text-muted-foreground font-mono ml-2">{fmtDate(item.soldAt)}</span> : null}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono mt-1">{formData.sold ? 'výpočet ceny zafixován (viz Cenotvorba)' : 'prodejem se zafixuje audit ceny'}</p>
            <div className="mt-2.5">
              {formData.sold ? (
                <button type="button" onClick={() => setField('sold', false)} className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors">Zrušit prodej</button>
              ) : (
                <button type="button" onClick={() => setField('sold', true)} style={{ color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }}
                  className="bg-card border hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5">
                  <Icon name="cash" className="w-3.5 h-3.5" />Označit prodáno
                </button>
              )}
            </div>
          </div>
        </div>
        <ChannelCard title="E-shop" color="var(--success)" on={formData.onShop} blocked={publishBlocked} blockedTitle={blockedTitle} at={fmtDate(item.onShopAt)} priceLine={priceLine} label="Vystavit na e-shop"
          onToggle={() => { if (publishBlocked) { alert(blockedTitle); return; } setField('onShop', !formData.onShop); }} />
        <ChannelCard title="Etsy" color="var(--warning)" on={formData.onEtsy} blocked={publishBlocked} blockedTitle={blockedTitle} at={fmtDate(item.onEtsyAt)} priceLine={priceLine} label="Vystavit na Etsy"
          onToggle={() => { if (publishBlocked) { alert(blockedTitle); return; } setField('onEtsy', !formData.onEtsy); }} />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground font-mono flex items-center gap-3 flex-wrap">
        <span>Audit:</span>
        <span>e-shop {item.onShopAt ? `vystaveno ${fmtDate(item.onShopAt)}` : 'nikdy nevystaveno'}</span>
        <span>· Etsy {item.onEtsyAt ? `vystaveno ${fmtDate(item.onEtsyAt)}` : 'nikdy nevystaveno'}</span>
        <span>· {item.soldAt ? `prodáno ${fmtDate(item.soldAt)}` : 'neprodáno'}</span>
        {item.priceCalcSnapshotAt && <a href="#pricing" className="hover:text-foreground">· snapshot výpočtu {fmtDate(item.priceCalcSnapshotAt)} ↗</a>}
      </p>
    </SectionCard>
  );
}
