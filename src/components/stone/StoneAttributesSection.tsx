'use client';

/** Sekce 3 — Fyzické vlastnosti: hmotnost (klíčové pole), ct a velikost (dopočet), tvar, poškození, místo, sbírkový, barvy. */
import { getPasShape } from '@/lib/pasShapes';
import { computeSizeCategory, SIZE_CATEGORY_COLOR } from '@/lib/sizeCategory';
import AttrSelect from '../AttrSelect';
import AttrMultiSelect from '../AttrMultiSelect';
import Icon from '../Icon';
import { useItemForm } from './ItemFormProvider';
import { SectionCard, Field, inputKey, computedBox } from './primitives';

export default function StoneAttributesSection() {
  const { item, formData, setField, missingHighlight, weightRaw, setWeightRaw, commitWeight } = useItemForm();
  const size = computeSizeCategory(formData.weight);
  const shape = getPasShape(formData.pasShape);

  // Banner K revizi / Chybí vstupy — vyjmenuje chybějící povinná pole (logika z původního formuláře).
  const banner = (() => {
    const status = item.pricingStatus;
    if (!status || status === 'OK') return null;
    const missing: string[] = [];
    if (!formData.pasShape) missing.push('tvar');
    if (!formData.attrDamage) missing.push('poškození');
    if (!formData.attrColor || formData.attrColor.length === 0) missing.push('barva');
    if (!formData.location) missing.push('místo nálezu');
    const w = parseFloat(formData.weight);
    if (!Number.isFinite(w) || w <= 0) missing.push('váha');
    const manualBelow = formData.manualPriceInclVatCzk && item.recommendedPriceInclVatCzk
      && Number(formData.manualPriceInclVatCzk) < Number(item.recommendedPriceInclVatCzk);
    const label = status === 'NEEDS_INPUT' ? 'CHYBÍ VSTUPY' : status === 'NEEDS_REVIEW' ? 'K REVIZI' : 'ZASTARALÉ';
    const color = status === 'NEEDS_INPUT' ? 'var(--destructive)' : status === 'NEEDS_REVIEW' ? 'var(--warning)' : 'var(--info)';
    return (
      <div className="mb-4 rounded-lg border-2 px-4 py-3 flex items-start gap-3" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        <Icon name="warning" className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color }} />
        <div className="text-xs">
          <p className="font-bold font-mono tracking-wider uppercase" style={{ color }}>{label}</p>
          {missing.length > 0 && <p className="mt-1 text-foreground">Chybí povinná pole: <span className="font-medium">{missing.join(', ')}</span>.</p>}
          {manualBelow && <p className="mt-1 text-foreground"><span className="font-semibold">Speciální cena</span> {formData.manualPriceInclVatCzk} Kč je pod doporučenou {item.recommendedPriceInclVatCzk} Kč.</p>}
          {missing.length === 0 && !manualBelow && status === 'STALE' && <p className="mt-1 text-foreground">Cenotvorba byla od posledního výpočtu změněna — spusť „Přepočítat“ v zakázce.</p>}
        </div>
      </div>
    );
  })();

  return (
    <SectionCard id="attributes" number={3} title="Fyzické vlastnosti" icon="gem" description="Vstupy do cenotvorby — hmotnost, tvar, poškození, místo nálezu, barva, sbírkový.">
      {banner}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Field label="Hmotnost (g)" icon="weight" missing={missingHighlight.weight} hint="kritický údaj pro cenotvorbu">
          <input type="text" inputMode="decimal" value={weightRaw} onChange={(e) => setWeightRaw(e.target.value)} onBlur={commitWeight}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputKey} />
        </Field>
        <Field label="Hmotnost (ct)" hint="dopočet: g × 5">
          <div className={computedBox}>{(parseFloat(formData.weight) * 5 || 0).toFixed(2)}</div>
        </Field>
        <Field label="Velikost" hint="dopočet podle hmotnosti">
          <div className={computedBox} style={size ? { color: SIZE_CATEGORY_COLOR[size] } : undefined}>{size ?? '—'}</div>
        </Field>
        <Field label="Tvar (PAS)" icon="shape" missing={missingHighlight.pasShape}>
          <AttrSelect attrKey="pasShape" value={formData.pasShape} onChange={(v) => setField('pasShape', v)} />
        </Field>
        <Field label="Poškození" icon="damage" missing={missingHighlight.attrDamage}>
          <AttrSelect attrKey="attrDamage" value={formData.attrDamage} onChange={(v) => setField('attrDamage', v)} />
        </Field>
        <Field label="Místo nálezu" icon="location" missing={missingHighlight.location}>
          <AttrSelect attrKey="location" value={formData.location} onChange={(v) => setField('location', v)} />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-4 items-start">
        <Field label="Sbírkový" icon="star">
          <label className="inline-flex items-center gap-2 cursor-pointer h-[26px]">
            <input type="checkbox" checked={formData.attrCollectible} onChange={(e) => setField('attrCollectible', e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-ring/20" />
            <span className="text-sm text-foreground">Sbírkový kámen</span>
          </label>
        </Field>
        <Field label="Barva (lze vybrat víc)" icon="palette" missing={missingHighlight.attrColor}>
          <AttrMultiSelect attrKey="attrColor" value={formData.attrColor} onChange={(v) => setField('attrColor', v)} color="var(--primary)" />
        </Field>
      </div>
      {shape && <p className="mt-3 text-[11px] text-muted-foreground italic">{shape.cz} — {shape.descCz} <span className="not-italic text-muted-foreground/70">· EN: {shape.en}</span></p>}
    </SectionCard>
  );
}
