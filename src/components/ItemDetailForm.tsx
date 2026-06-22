'use client';

import { useState } from 'react';
import { formatPrice, parseDecimalCs } from '@/lib/utils';
import { getPasShape } from '@/lib/pasShapes';
import { computeSizeCategory, SIZE_CATEGORY_COLOR } from '@/lib/sizeCategory';
import dynamic from 'next/dynamic';
import AutocompleteInput from './AutocompleteInput';
import AttrSelect from './AttrSelect';
import AttrMultiSelect from './AttrMultiSelect';
import Icon from './Icon';
import { apiFetch } from '@/lib/apiFetch';
import SaleSnapshotPanel from './SaleSnapshotPanel';

const RichTextEditor = dynamic(() => import('./RichTextEditor'), { ssr: false });

interface ItemData {
  id: number;
  evidNumber: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  longDescription: string;
  longDescriptionEn: string;
  location: string;
  storage: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
  sold: boolean;
  onShop: boolean;
  onEtsy: boolean;
  pasShape: string;
  attrDamage?: string;
  attrColor?: string[];
  attrCollectible?: boolean;
  box: { code: string; id: number };
  priceEUR?: number;
  priceUSD?: number;
  costBasisCzk?: string | null;
  recommendedPriceInclVatCzk?: string | null;
  manualPriceInclVatCzk?: string | null;
  pricingStatus?: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE' | null;
  purchasePricePerGramCzk?: string | null;
  soldAt?: string | null;
  priceCalcSnapshot?: unknown;
  priceCalcSnapshotAt?: string | null;
  priceCalcBreakdown?: unknown;
}

export default function ItemDetailForm({ item }: { item: ItemData }) {
  const [lang, setLang] = useState<'cz' | 'en'>('cz');
  const [formData, setFormData] = useState({
    name: item.name,
    nameEn: item.nameEn,
    description: item.description,
    descriptionEn: item.descriptionEn,
    longDescription: item.longDescription,
    longDescriptionEn: item.longDescriptionEn,
    location: item.location,
    storage: item.storage,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    weight: item.weight,
    sold: item.sold,
    onShop: item.onShop,
    onEtsy: item.onEtsy,
    pasShape: item.pasShape || '',
    attrDamage: item.attrDamage || '',
    attrColor: item.attrColor || [],
    attrCollectible: item.attrCollectible || false,
    manualPriceInclVatCzk: item.manualPriceInclVatCzk ?? '',
    purchasePricePerGramCzk: item.purchasePricePerGramCzk ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          nameEn: formData.nameEn,
          description: formData.description,
          descriptionEn: formData.descriptionEn,
          longDescription: formData.longDescription,
          longDescriptionEn: formData.longDescriptionEn,
          location: formData.location,
          storage: formData.storage,
          purchasePrice: parseFloat(formData.purchasePrice) || 0,
          salePrice: parseFloat(formData.salePrice) || 0,
          weight: parseFloat(formData.weight) || 0,
          sold: formData.sold,
          onShop: formData.onShop,
          onEtsy: formData.onEtsy,
          pasShape: formData.pasShape,
          attrDamage: formData.attrDamage,
          attrColor: formData.attrColor,
          attrCollectible: formData.attrCollectible,
          manualPriceInclVatCzk: formData.manualPriceInclVatCzk === '' ? null : Number(formData.manualPriceInclVatCzk),
          purchasePricePerGramCzk: formData.purchasePricePerGramCzk === '' ? null : Number(formData.purchasePricePerGramCzk),
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;

  // Per-field highlight — kdyz je status NEEDS_REVIEW/NEEDS_INPUT, pole
  // ktera chybi dostanou oranzovy ring (warning) primo na sebe. Jakmile
  // user vybere/zadat hodnotu, controlled state to schova (formData se
  // updatne -> missing.X = false -> ring zmizi).
  const reviewMode = item.pricingStatus === 'NEEDS_REVIEW' || item.pricingStatus === 'NEEDS_INPUT';
  const missingHighlight = {
    pasShape: reviewMode && !formData.pasShape,
    attrDamage: reviewMode && !formData.attrDamage,
    attrColor: reviewMode && (!formData.attrColor || formData.attrColor.length === 0),
    location: reviewMode && !formData.location,
    weight: reviewMode && (!formData.weight || !Number.isFinite(parseFloat(formData.weight)) || parseFloat(formData.weight) <= 0),
  };

  // Banner „K revizi" — viditelne nahore detail karte. Vyjmenuje povinna
  // pole co kameni chybi, plus pripadnou manualPrice anomalii. Skryje se
  // pouze pro status OK; pro NEEDS_INPUT/NEEDS_REVIEW/STALE je viditelny.
  const reviewBanner = (() => {
    const status = item.pricingStatus;
    if (!status || status === 'OK') return null;
    const missing: string[] = [];
    if (!formData.pasShape) missing.push('tvar');
    if (!formData.attrDamage) missing.push('poškození');
    if (!formData.attrColor || formData.attrColor.length === 0) missing.push('barva');
    if (!formData.location) missing.push('místo nálezu');
    const weight = parseFloat(formData.weight);
    if (!Number.isFinite(weight) || weight <= 0) missing.push('váha');
    const manualBelow = formData.manualPriceInclVatCzk
      && item.recommendedPriceInclVatCzk
      && Number(formData.manualPriceInclVatCzk) < Number(item.recommendedPriceInclVatCzk);
    const label = status === 'NEEDS_INPUT' ? 'CHYBÍ VSTUPY' : status === 'NEEDS_REVIEW' ? 'K REVIZI' : 'ZASTARALÉ';
    const color = status === 'NEEDS_INPUT' ? 'var(--destructive)' : status === 'NEEDS_REVIEW' ? 'var(--warning)' : 'var(--info)';
    return (
      <div
        className="mb-4 rounded-lg border-2 p-4 flex items-start gap-3"
        style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} style={{ color }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-mono tracking-wider uppercase" style={{ color }}>{label}</p>
          {missing.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs text-foreground">Chybí povinná evidenční pole:</p>
              <ul className="mt-1 text-sm font-medium text-foreground space-y-0.5">
                {missing.map((m) => (
                  <li key={m} className="flex items-center gap-2">
                    <span className="inline-block w-1 h-1 rounded-full bg-foreground/50" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {manualBelow && (
            <p className="mt-2 text-xs text-foreground">
              <span className="font-semibold">Speciální cena</span> {formData.manualPriceInclVatCzk} Kč je pod doporučenou {item.recommendedPriceInclVatCzk} Kč.
            </p>
          )}
          {missing.length === 0 && !manualBelow && status === 'STALE' && (
            <p className="mt-1 text-xs text-foreground">Cenotvorba byla od posledního výpočtu změněna — spusť „Přepočítat" v zakázce.</p>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      {reviewBanner}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold">Detail kamene</h2>
        {/* CZ/EN switcher */}
        <div className="flex items-center bg-muted border border-border rounded-lg p-0.5">
          <button
            onClick={() => setLang('cz')}
            className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${
              lang === 'cz' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            CZ
          </button>
          <button
            onClick={() => setLang('en')}
            style={lang === 'en' ? { background: 'var(--info)', color: '#fff' } : undefined}
            className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${
              lang === 'en' ? '' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Read-only */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Katalogové číslo</label>
          <p className="text-foreground font-mono">{catalogNumber}</p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
            Název produktu {lang === 'en' && <span style={{ color: 'var(--info)' }} className="font-mono">(EN)</span>}
          </label>
          {lang === 'cz' ? (
            <input
              type="text" value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              placeholder={`Moldavit ${catalogNumber}`}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground transition-shadow"
            />
          ) : (
            <input
              type="text" value={formData.nameEn}
              onChange={(e) => setFormData((f) => ({ ...f, nameEn: e.target.value }))}
              placeholder={`Moldavite ${catalogNumber}`}
              className="w-full bg-card border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 placeholder:text-muted-foreground transition-shadow border-[color-mix(in_srgb,var(--info)_30%,transparent)] focus:border-[var(--info)] focus:ring-[color-mix(in_srgb,var(--info)_20%,transparent)]"
            />
          )}
        </div>

        {/* Short description */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
            Krátký popis {lang === 'en' && <span style={{ color: 'var(--info)' }} className="font-mono">(EN)</span>}
          </label>
          {lang === 'cz' ? (
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Krátký popis kamene..."
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 resize-none placeholder:text-muted-foreground transition-shadow"
            />
          ) : (
            <textarea
              value={formData.descriptionEn}
              onChange={(e) => setFormData((f) => ({ ...f, descriptionEn: e.target.value }))}
              rows={2} placeholder="Short description..."
              className="w-full bg-card border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 resize-none placeholder:text-muted-foreground transition-shadow border-[color-mix(in_srgb,var(--info)_30%,transparent)] focus:border-[var(--info)] focus:ring-[color-mix(in_srgb,var(--info)_20%,transparent)]"
            />
          )}
        </div>

        {/* Long description (rich text) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-muted-foreground uppercase tracking-wider">
              Delší popis {lang === 'en' ? <span style={{ color: 'var(--info)' }} className="font-mono">(EN)</span> : '(HTML)'}
            </label>
            {(lang === 'cz' ? formData.longDescription : formData.longDescriptionEn).length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {(lang === 'cz' ? formData.longDescription : formData.longDescriptionEn).length} znaků
              </span>
            )}
          </div>
          {lang === 'cz' ? (
            <RichTextEditor
              content={formData.longDescription}
              onChange={(html) => setFormData((f) => ({ ...f, longDescription: html }))}
              placeholder="Podrobný popis pro eshopy..."
            />
          ) : (
            <RichTextEditor
              content={formData.longDescriptionEn}
              onChange={(html) => setFormData((f) => ({ ...f, longDescriptionEn: html }))}
              placeholder="Detailed description for shops..."
            />
          )}
        </div>

        {/* Storage (lokalita nálezu je teď v sekci Atributy níže jako AttrSelect) */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Umístění (fyzické)</label>
          <AutocompleteInput
            value={formData.storage}
            onChange={(v) => setFormData((f) => ({ ...f, storage: v }))}
            field="storage"
            placeholder="Kde je kámen fyzicky uložen..."
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground transition-shadow"
          />
        </div>

        {/* HMOTNOST — kriticky udaj pro evidenci i cenotvorbu. Zvyraznena karta
            s primary border tintem, vetsi font v inputu (text-lg + font-bold),
            kategorie velikosti hned vedle. */}
        <div className="rounded-xl border-2 p-4 bg-card" style={{ borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-foreground inline-flex items-center gap-1.5">
              <Icon name="weight" className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <span className="font-semibold">Hmotnost</span>
              <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">— kritický údaj pro cenotvorbu</span>
            </h3>
            {(() => {
              const cat = computeSizeCategory(formData.weight);
              if (!cat) return null;
              const color = SIZE_CATEGORY_COLOR[cat];
              return (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider border"
                  title="Kategorie velikosti — automaticky podle hmotnosti"
                  style={{
                    color,
                    background: `color-mix(in srgb, ${color} 14%, transparent)`,
                    borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                  }}
                >
                  {cat}
                </span>
              );
            })()}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-mono">Hmotnost (g)</label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.weight}
                onChange={(e) => setFormData((f) => ({ ...f, weight: e.target.value }))}
                onBlur={(e) => {
                  // Normalizace carka → tecka na blur
                  const raw = e.target.value.trim();
                  if (raw === '') return;
                  const n = parseDecimalCs(raw);
                  if (Number.isFinite(n) && String(n) !== raw) {
                    setFormData((f) => ({ ...f, weight: String(n) }));
                  }
                }}
                className={`w-full bg-background border rounded-lg px-3 py-2.5 text-lg font-mono font-bold text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow ${
                  missingHighlight.weight ? 'border-warning ring-2 ring-warning/40' : 'border-border'
                }`}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-mono">Hmotnost (ct)</label>
              <div className="w-full bg-muted/60 border border-dashed border-border rounded-lg px-3 py-2.5 text-lg font-mono font-bold text-muted-foreground">
                {(parseFloat(formData.weight) * 5 || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Atributy kamene — řízené hodnoty z AttrOption */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="shape" className="w-3.5 h-3.5" />
              Tvar (PAS) {missingHighlight.pasShape && <span className="text-warning font-bold">·</span>}
            </label>
            <div className={missingHighlight.pasShape ? 'rounded-md ring-2 ring-warning/70 transition-all' : ''}>
              <AttrSelect
                attrKey="pasShape"
                value={formData.pasShape}
                onChange={(v) => setFormData((f) => ({ ...f, pasShape: v }))}
              />
            </div>
            {formData.pasShape && getPasShape(formData.pasShape) && (
              <p className="mt-1.5 text-xs text-muted-foreground italic">
                {lang === 'en' ? getPasShape(formData.pasShape)?.descEn : getPasShape(formData.pasShape)?.descCz}
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="damage" className="w-3.5 h-3.5" />
              Poškození {missingHighlight.attrDamage && <span className="text-warning font-bold">·</span>}
            </label>
            <div className={missingHighlight.attrDamage ? 'rounded-md ring-2 ring-warning/70 transition-all' : ''}>
              <AttrSelect
                attrKey="attrDamage"
                value={formData.attrDamage}
                onChange={(v) => setFormData((f) => ({ ...f, attrDamage: v }))}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="location" className="w-3.5 h-3.5" />
              Místo nálezu {missingHighlight.location && <span className="text-warning font-bold">·</span>}
            </label>
            <div className={missingHighlight.location ? 'rounded-md ring-2 ring-warning/70 transition-all' : ''}>
              <AttrSelect
                attrKey="location"
                value={formData.location}
                onChange={(v) => setFormData((f) => ({ ...f, location: v }))}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="star" className="w-3.5 h-3.5" />
              Sbírkový
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={formData.attrCollectible}
                onChange={(e) => setFormData((f) => ({ ...f, attrCollectible: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary focus:ring-ring/20"
              />
              <span className="text-sm text-foreground">Označit jako sbírkový kámen</span>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="palette" className="w-3.5 h-3.5" />
              Barva (lze vybrat víc) {missingHighlight.attrColor && <span className="text-warning font-bold">·</span>}
            </label>
            <div className={missingHighlight.attrColor ? 'rounded-md ring-2 ring-warning/70 transition-all p-0.5' : ''}>
              <AttrMultiSelect
                attrKey="attrColor"
                value={formData.attrColor}
                onChange={(v) => setFormData((f) => ({ ...f, attrColor: v }))}
                color="var(--primary)"
              />
            </div>
          </div>
        </div>

        {/* CENY — 4 řádky */}
        <PriceSection
          purchasePrice={formData.purchasePrice}
          setPurchasePrice={(v) => setFormData((f) => ({ ...f, purchasePrice: v }))}
          salePrice={formData.salePrice}
          setSalePrice={(v) => setFormData((f) => ({ ...f, salePrice: v }))}
          manualPrice={formData.manualPriceInclVatCzk}
          setManualPrice={(v) => setFormData((f) => ({ ...f, manualPriceInclVatCzk: v }))}
          ppgOverride={formData.purchasePricePerGramCzk}
          setPpgOverride={(v) => setFormData((f) => ({ ...f, purchasePricePerGramCzk: v }))}
          costBasisCzk={item.costBasisCzk}
          recommendedPriceInclVatCzk={item.recommendedPriceInclVatCzk}
          pricingStatus={item.pricingStatus}
          priceCalcBreakdown={item.priceCalcBreakdown}
          usedPpgHint={(() => {
            // Derivuje použité PPG z aktuální purchasePrice / weight (po recalculate).
            const w = Number(formData.weight);
            const pp = Number(formData.purchasePrice);
            return w > 0 && pp > 0 ? (pp / w).toFixed(2) : null;
          })()}
          orderHref={`/orders`}
        />

        {/* SNAPSHOT VÝPOČTU PŘI PRODEJI — zafixovaný audit, jen pro prodané kameny */}
        {item.sold && item.priceCalcSnapshot ? (
          <SaleSnapshotPanel
            snapshot={item.priceCalcSnapshot as never}
            capturedAt={item.priceCalcSnapshotAt ?? null}
            soldAt={item.soldAt ?? null}
          />
        ) : null}

        {/* Converted prices */}
        {(Number(item.priceEUR) > 0 || Number(item.priceUSD) > 0) ? (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Přepočtené ceny</label>
            <div className="flex gap-3 text-sm">
            {item.priceEUR !== undefined && item.priceEUR > 0 && (
              <div className="bg-muted border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                <span style={{ color: 'var(--info)' }} className="font-mono font-semibold text-[10px] uppercase tracking-wider">EUR</span>
                <span className="text-foreground font-mono font-semibold">{Math.round(item.priceEUR)}</span>
              </div>
            )}
            {item.priceUSD !== undefined && item.priceUSD > 0 && (
              <div className="bg-muted border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                <span style={{ color: 'var(--success)' }} className="font-mono font-semibold text-[10px] uppercase tracking-wider">USD</span>
                <span className="text-foreground font-mono font-semibold">{Math.round(item.priceUSD)}</span>
              </div>
            )}
            </div>
          </div>
        ) : null}

        {/* Sold + Toggles */}
        <div className="space-y-3 pt-2">
          <div
            className="flex items-center justify-between p-3 rounded-lg border transition-colors"
            style={formData.sold ? {
              background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
            } : {
              background: 'color-mix(in srgb, var(--muted) 50%, transparent)',
              borderColor: 'var(--border)',
            }}
          >
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Status</label>
              <p className="text-sm mt-1">
                {formData.sold ? (
                  <span
                    style={{ color: 'var(--destructive)' }}
                    className="font-mono font-semibold uppercase tracking-wider text-xs"
                  >
                    Prodáno
                  </span>
                ) : (
                  <span className="text-muted-foreground">Neprodáno</span>
                )}
              </p>
            </div>
            {formData.sold ? (
              <button
                onClick={() => setFormData((f) => ({ ...f, sold: !f.sold }))}
                className="bg-transparent border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Zrušit prodej
              </button>
            ) : (
              <button
                onClick={() => setFormData((f) => ({ ...f, sold: !f.sold }))}
                style={{
                  color: 'var(--destructive)',
                  borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
                }}
                className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Označit jako prodané
              </button>
            )}
          </div>

          {/* Gating: dokud neni cena v poradku (OK nebo STALE), nelze vystavit. */}
          {/* Server-side PATCH item endpoint odmita totez (defense-in-depth). */}
          {(() => {
            const publishBlocked = item.pricingStatus
              && item.pricingStatus !== 'OK'
              && item.pricingStatus !== 'STALE';
            const blockedTitle = publishBlocked
              ? 'Dopiš chybějící údaje a spusť „Přepočítat" v zakázce — kámen ve stavu '
                + (item.pricingStatus === 'NEEDS_INPUT' ? 'BEZ VSTUPŮ' : 'K REVIZI')
                + ' nelze vystavit.'
              : undefined;
            return (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider font-mono">Vystavit na Eshop</label>
                    <p className="text-xs text-muted-foreground">Prodejní cena: {formatPrice(formData.salePrice)}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (publishBlocked) {
                        alert(blockedTitle);
                        return;
                      }
                      setFormData((f) => ({ ...f, onShop: !f.onShop }));
                    }}
                    disabled={!!publishBlocked}
                    title={blockedTitle}
                    style={formData.onShop && !publishBlocked ? { background: 'var(--success)' } : undefined}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ring-inset ${
                      publishBlocked ? 'bg-muted ring-border opacity-50 cursor-not-allowed' :
                      formData.onShop ? 'ring-transparent' : 'bg-muted ring-border'
                    }`}
                    aria-label="Vystavit na Eshop"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                      formData.onShop && !publishBlocked ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Vystavit na Etsy</label>
                  <button
                    onClick={() => {
                      if (publishBlocked) {
                        alert(blockedTitle);
                        return;
                      }
                      setFormData((f) => ({ ...f, onEtsy: !f.onEtsy }));
                    }}
                    disabled={!!publishBlocked}
                    title={blockedTitle}
                    style={formData.onEtsy && !publishBlocked ? { background: 'var(--warning)' } : undefined}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ring-inset ${
                      publishBlocked ? 'bg-muted ring-border opacity-50 cursor-not-allowed' :
                      formData.onEtsy ? 'ring-transparent' : 'bg-muted ring-border'
                    }`}
                    aria-label="Vystavit na Etsy"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                      formData.onEtsy && !publishBlocked ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Save */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Ukládám…' : 'Uložit změny'}
        </button>
        {saved && (
          <span style={{ color: 'var(--success)' }} className="text-sm font-mono uppercase tracking-wider text-xs">
            ✓ Uloženo
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Sekce „Ceny" — 4 řádky:
 *  1. Cena nákupní (editovatelná) — purchasePrice
 *  2. Cena s náklady (read-only) — costBasisCzk z cenotvorby (purchase + alokace)
 *  3. Cena prodejní (editovatelná) — salePrice, eshop konzumuje tuto
 *     hodnotu. Hint vedle: doporučená z cenotvorby.
 *  4. Cena speciální (editovatelná) — manualPriceInclVatCzk, override
 *     pro mimořádně pěkné kameny (musí být ≥ doporučená, jinak NEEDS_REVIEW).
 */
function PriceSection({
  purchasePrice,
  setPurchasePrice,
  salePrice,
  setSalePrice,
  manualPrice,
  setManualPrice,
  ppgOverride,
  setPpgOverride,
  costBasisCzk,
  recommendedPriceInclVatCzk,
  pricingStatus,
  priceCalcBreakdown,
  usedPpgHint,
}: {
  purchasePrice: string;
  setPurchasePrice: (v: string) => void;
  salePrice: string;
  setSalePrice: (v: string) => void;
  manualPrice: string;
  setManualPrice: (v: string) => void;
  ppgOverride: string;
  setPpgOverride: (v: string) => void;
  costBasisCzk: string | null | undefined;
  recommendedPriceInclVatCzk: string | null | undefined;
  pricingStatus: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE' | null | undefined;
  priceCalcBreakdown?: unknown;
  usedPpgHint: string | null;
  orderHref: string;
}) {
  const fmt = (v: string | null | undefined) =>
    v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0
      ? `${Math.round(Number(v)).toLocaleString('cs-CZ')} Kč`
      : '—';

  const manualNum = Number(manualPrice);
  const recommendedNum = Number(recommendedPriceInclVatCzk);
  const manualBelowRecommended =
    Number.isFinite(manualNum) && manualNum > 0 && Number.isFinite(recommendedNum) && recommendedNum > 0 && manualNum < recommendedNum;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-foreground inline-flex items-center gap-1.5">
          <Icon name="cash" className="w-3.5 h-3.5" />
          Ceny
        </h3>
        {pricingStatus && pricingStatus !== 'OK' && (
          <PricingStatusBadge status={pricingStatus} />
        )}
      </div>

      <div className="divide-y divide-border">
        {/* 1. Cena nákupní */}
        <PriceRow
          label="Cena nákupní"
          hint="Co stál kámen při nákupu od dodavatele."
          editable
          value={purchasePrice}
          onChange={setPurchasePrice}
        />

        {/* 1b. Cena nákupní za gram (override) — pro výjimečné kameny */}
        {/* Placeholder ukazuje zděděnou PPG (kazeta → zakázka) jako tlumený text v poli. */}
        {/* Když user napíše vlastní hodnotu, override; smaže-li, zase dědí. */}
        <PriceRow
          label="Cena nákupní za gram"
          hint={
            ppgOverride && Number(ppgOverride) > 0
              ? 'Override jen pro tento kámen — přebije PPG kazety i zakázky.'
              : 'Zděděno z kazety / zakázky (tlumeně v poli). Přepiš pro override jen tohoto kamene.'
          }
          editable
          value={ppgOverride}
          onChange={setPpgOverride}
          placeholder={usedPpgHint ?? '—'}
          rightExtra={
            <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: ppgOverride && Number(ppgOverride) > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}>
              {ppgOverride && Number(ppgOverride) > 0 ? '⚠ override aktivní' : 'dědí (kazeta → zakázka)'}
            </span>
          }
        />

        {/* 2. Cena s náklady */}
        <PriceRow
          label="Cena s náklady"
          hint="Nákupní cena + alokovaný podíl na společných nákladech zakázky (doprava, certifikace…)."
          editable={false}
          displayValue={fmt(costBasisCzk)}
          emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
        />

        {/* 3. Cena prodejní */}
        <PriceRow
          label="Cena prodejní"
          hint={'Cena pro eshop / Etsy. Při každém přepočtu zakázky se přepíše na doporučenou. Pro speciální cenu mimo cenotvorbu použij pole „Cena speciální" níže.'}
          editable
          value={salePrice}
          onChange={setSalePrice}
          rightExtra={
            recommendedPriceInclVatCzk && Number(recommendedPriceInclVatCzk) > 0 ? (
              (() => {
                const sale = Number(salePrice);
                const rec = Number(recommendedPriceInclVatCzk);
                const matches = sale > 0 && Math.abs(sale - rec) < 0.5;
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: matches ? 'var(--success)' : 'var(--muted-foreground)' }}>
                      {matches ? `✓ odpovídá doporučené (${fmt(recommendedPriceInclVatCzk)})` : `doporučená: ${fmt(recommendedPriceInclVatCzk)}`}
                    </span>
                    <BreakdownTooltip breakdown={priceCalcBreakdown} />
                  </span>
                );
              })()
            ) : null
          }
        />

        {/* 4. Cena speciální */}
        <PriceRow
          label="Cena speciální"
          hint="Mimořádně vyšší cena pro výjimečně pěkné kameny (override doporučené). Musí být ≥ doporučená."
          editable
          value={manualPrice}
          onChange={setManualPrice}
          placeholder="—"
          rightExtra={
            manualBelowRecommended ? (
              <span className="text-[10px] text-warning font-mono whitespace-nowrap" title="Speciální cena je pod doporučeným minimem — kámen bude označen NEEDS_REVIEW">
                ⚠ pod doporučenou
              </span>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function PriceRow({
  label,
  hint,
  editable,
  value,
  onChange,
  displayValue,
  emptyHint,
  placeholder,
  rightExtra,
}: {
  label: string;
  hint?: string;
  editable: boolean;
  value?: string;
  onChange?: (v: string) => void;
  displayValue?: string;
  emptyHint?: string;
  placeholder?: string;
  rightExtra?: React.ReactNode;
}) {
  // Sjednocený layout: 2-sloupcový grid, value box vždy stejná šířka.
  // rightExtra (např. „doporučená: 460 Kč" pro Cena prodejní) se ukáže pod
  // popisem vlevo, ne v rohu — aby neměnil šířku value boxu a aby všechny
  // řádky byly opticky zarovnané jako tabulka.
  return (
    <div className="grid grid-cols-[1fr_10rem] items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{hint}</p>}
        {rightExtra && <div className="mt-0.5">{rightExtra}</div>}
      </div>
      <div className="w-full">
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            onBlur={(e) => {
              // Normalizuj „5,67" → „5.67" na blur — vstup akceptuje carku,
              // ale zobrazujeme + ukladame s teckou (konzistentni napric appkou).
              const raw = e.target.value.trim();
              if (raw === '' || !onChange) return;
              const n = parseDecimalCs(raw);
              if (Number.isFinite(n) && String(n) !== raw) onChange(String(n));
            }}
            placeholder={placeholder ?? ''}
            className="w-full bg-card border border-border rounded-lg px-3 h-9 text-sm font-mono text-right text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        ) : (
          // Read-only display — vizuálně jasně odlišený od inputu (silnější
          // muted background + dashed border + zámek ikona) ale stejný rozměr,
          // aby řádky byly zarovnané v jedné linii.
          <div
            className="w-full bg-muted border border-dashed border-border rounded-lg px-3 h-9 inline-flex items-center justify-end gap-2 text-sm font-mono text-foreground"
            title={emptyHint ?? 'Spočítané pole — nelze přímo editovat'}
          >
            <svg className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {displayValue && displayValue !== '—' ? (
              displayValue
            ) : (
              <span className="text-muted-foreground/60 italic font-sans text-[10px]">{emptyHint ? 'spočítá se' : '—'}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PricingStatusBadge({ status }: { status: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE' }) {
  const meta: Record<string, { label: string; color: string }> = {
    NEEDS_INPUT:  { label: 'Bez vstupů',  color: 'var(--muted-foreground)' },
    NEEDS_REVIEW: { label: 'K revizi',    color: 'var(--warning)' },
    STALE:        { label: 'Zastaralé',   color: 'var(--info)' },
    OK:           { label: 'Spočítáno',   color: 'var(--success)' },
  };
  const m = meta[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border"
      style={{
        color: m.color,
        background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${m.color} 30%, transparent)`,
      }}
    >
      <Icon name={status === 'OK' ? 'ok' : status === 'NEEDS_REVIEW' || status === 'STALE' ? 'warning' : 'pending'} className="w-3 h-3" />
      {m.label}
    </span>
  );
}

/**
 * Info ikona vedle „doporučená cena" — po najetí ukáže rozpis pravidel cenotvorby
 * (per-rule margin) co bylo aplikováno v posledním Přepočítat. Tichá pokud breakdown chybí.
 */
function BreakdownTooltip({ breakdown }: { breakdown: unknown }) {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const b = breakdown as { marginBreakdown?: Array<{ ruleKey: string; matched: string | null; marginRate: string }>, totalMarginRate?: string };
  const rules = Array.isArray(b.marginBreakdown) ? b.marginBreakdown : [];
  if (rules.length === 0) return null;

  const fmtPct = (rate: string) => {
    const n = Number(rate);
    if (!Number.isFinite(n)) return rate;
    const pct = n * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  };

  // Plain-text tooltip (browser native title). Pro full hover popover bychom potrebovali
  // Radix Tooltip — title staci pro „kdyz potrebuji vedet".
  const lines: string[] = ['Použité koeficienty cenotvorby:'];
  for (const r of rules) {
    const matched = r.matched ? `(${r.matched})` : '(bez shody)';
    lines.push(`  • ${r.ruleKey} ${matched} → ${fmtPct(r.marginRate)}`);
  }
  if (b.totalMarginRate) {
    lines.push(`Celková marže: ${fmtPct(b.totalMarginRate)}`);
  }
  const title = lines.join('\n');

  return (
    <span
      title={title}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Použité koeficienty cenotvorby"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    </span>
  );
}
