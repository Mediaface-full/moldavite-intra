'use client';

/** Sekce 1 — Základní identita: název CZ/EN, krátký popis CZ/EN, katalog, kazeta, umístění. */
import Link from 'next/link';
import AutocompleteInput from '../AutocompleteInput';
import { useItemForm } from './ItemFormProvider';
import { SectionCard, Field, inputKey, inputEn, inputStd } from './primitives';

export default function StoneIdentitySection() {
  const { item, formData, setField, catalogNumber } = useItemForm();
  return (
    <SectionCard id="identity" number={1} title="Základní identita" icon="tag" description="Název a krátký popis jdou do e-shopu a na Etsy. Oba jazyky vedle sebe.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Název produktu">
          <input type="text" value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder={`Moldavit ${catalogNumber}`} className={inputKey} />
        </Field>
        <Field label="Název produktu" lang="EN">
          <input type="text" value={formData.nameEn} onChange={(e) => setField('nameEn', e.target.value)} placeholder={`Moldavite ${catalogNumber}`} className={`${inputEn} h-10 text-base font-semibold`} />
        </Field>
        <Field label="Krátký popis">
          <textarea value={formData.description} onChange={(e) => setField('description', e.target.value)} rows={3} placeholder="Krátký popis kamene…" className={`${inputStd} resize-none`} />
        </Field>
        <Field label="Krátký popis" lang="EN">
          <textarea value={formData.descriptionEn} onChange={(e) => setField('descriptionEn', e.target.value)} rows={3} placeholder="Short description…" className={`${inputEn} resize-none`} />
        </Field>
      </div>
      <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 md:grid-cols-[auto_auto_minmax(0,1fr)] gap-4 items-end">
        <div>
          <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1">Katalogové číslo</p>
          <p className="font-mono text-sm text-foreground h-9 inline-flex items-center">{catalogNumber}</p>
        </div>
        <div>
          <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1">Kazeta · zakázka</p>
          <p className="font-mono text-sm h-9 inline-flex items-center gap-2">
            <Link href={`/boxes/${item.box.id}`} className="text-foreground hover:text-primary transition-colors">{item.box.code}</Link>
            <span className="text-muted-foreground">·</span>
            {item.order ? <Link href={`/orders/${item.order.id}`} className="text-foreground hover:text-primary transition-colors">{item.order.code}</Link> : <span className="text-muted-foreground">skladová</span>}
          </p>
        </div>
        <Field label="Umístění (fyzické)" icon="storage">
          <AutocompleteInput value={formData.storage} onChange={(v) => setField('storage', v)} field="storage" placeholder="Kde je kámen fyzicky uložen…" className={inputStd} />
        </Field>
      </div>
    </SectionCard>
  );
}
