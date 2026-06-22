'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  computedMinPriceExVatCzk?: string | null;
  recommendedPriceInclVatCzk?: string | null;
  vatRatePct?: string | null;  // ze zakazky, pro UI prevod „Cena specialni bez DPH" → s DPH
  manualPriceInclVatCzk?: string | null;
  pricingStatus?: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE' | null;
  purchasePricePerGramCzk?: string | null;
  soldAt?: string | null;
  priceCalcSnapshot?: unknown;
  priceCalcSnapshotAt?: string | null;
  priceCalcBreakdown?: unknown;
}

export default function ItemDetailForm({ item }: { item: ItemData }) {
  const router = useRouter();
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
        // Refresh server-rendered data — server po PATCH spustil order recalc
        // (pokud změna ovlivnila cenu), takže fresh data potřeba pro update
        // recommendedPrice / breakdown / status v UI bez page reload.
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  // Autosave — po kazdy zmene formData (debounce 800ms) spustime save.
  // Server po PATCH spousti auto-recalc Order, takze recommended cena +
  // breakdown se propisuji rovnou bez „Ulozit" tlacitka.
  // Skipni initial mount (formData == item) aby autosave nebezel pri otevreni karty.
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const skipNextAutoSave = useRef(true);
  useEffect(() => {
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave();
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Resync formData kdyz prijde fresh `item` prop ze serveru (po router.refresh).
  // Bez tohoto by `formData` drzelo stara client state — server uz ma novou
  // recommendedPrice/salePrice (po auto-recalc Order), ale UI by je nevidelo.
  // skipNextAutoSave = true → useEffect[formData] preskoci save (zmena prisla
  // ze serveru, ne od uzivatele).
  useEffect(() => {
    skipNextAutoSave.current = true;
    setFormData({
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
  }, [item]);

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
          computedMinPriceExVatCzk={item.computedMinPriceExVatCzk}
          recommendedPriceInclVatCzk={item.recommendedPriceInclVatCzk}
          vatRatePct={item.vatRatePct}
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

      {/* Autosave status — bez tlacitka. Save bezi automaticky 800ms po posledni
          zmene, server hned spousti recalc Order. „Ulozit hned" tlacitko nuti
          okamzity save (force flush) pred tim nez user opusti stranku. */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs font-mono text-muted-foreground inline-flex items-center gap-2">
          {saving ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Ukládám…</span>
            </>
          ) : saved ? (
            <span style={{ color: 'var(--success)' }} className="inline-flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Uloženo
            </span>
          ) : (
            <span className="opacity-60">Změny se ukládají automaticky.</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          title="Uložit hned bez čekání na auto-save"
        >
          Uložit hned
        </button>
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
  computedMinPriceExVatCzk,
  recommendedPriceInclVatCzk,
  vatRatePct,
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
  computedMinPriceExVatCzk: string | null | undefined;
  recommendedPriceInclVatCzk: string | null | undefined;
  vatRatePct: string | null | undefined;
  pricingStatus: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE' | null | undefined;
  priceCalcBreakdown?: unknown;
  usedPpgHint: string | null;
  orderHref: string;
}) {
  const fmt = (v: string | null | undefined) =>
    v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0
      ? `${Math.round(Number(v)).toLocaleString('cs-CZ')} Kč`
      : '—';

  // DPH koeficient ze zakazky (fallback 21% pokud zakazka chybi/legacy data).
  const vatRate = vatRatePct && Number(vatRatePct) > 0 ? Number(vatRatePct) : 21;
  const vatMultiplier = 1 + vatRate / 100;

  // Cena specialni: UI vstup je „bez DPH", ALE v DB se uklada s DPH
  // (manualPriceInclVatCzk — pole se historicky jmenuje takhle).
  // Pri zobrazeni: konvertujeme uloznou s-DPH hodnotu zpet na bez-DPH pro input.
  // Pri ulozeni: input je bez DPH, pred PATCH se nasobi (1 + vatRate/100).
  // POZOR: manualPrice prop drzi RAW hodnotu z formData = s DPH (handleSave
  // posila Number(formData.manualPriceInclVatCzk) primo). Konverze je v ItemDetailForm
  // useEffect[item] kdy resync z item.manualPriceInclVatCzk → my zde jen prevadime
  // pro UI display. Save flow viz nize.
  const manualNum = Number(manualPrice);  // s DPH (jak je v DB / formData)
  const manualExVat = Number.isFinite(manualNum) && manualNum > 0 ? manualNum / vatMultiplier : 0;

  const recommendedNum = Number(recommendedPriceInclVatCzk);
  const manualBelowRecommended =
    Number.isFinite(manualNum) && manualNum > 0 && Number.isFinite(recommendedNum) && recommendedNum > 0 && manualNum < recommendedNum;

  // Lokalni raw text pro vstup „Cena specialni (bez DPH)" — user pise volne,
  // hodnota se commituje (a posila do parent / autosave / server) az na BLUR.
  // Bez tohoto by kazdy keystroke triggernul conversion bez-DPH→s-DPH a zpet
  // pres formData, coz prepisuje text v inputu (kurzor skace, desetiny se rusi).
  // Plus „pod doporucenou" warning se ukaze az po blur (ne pri psani „1, 10, 100,
  // 1000, 10000" kde mezistavy jsou pod doporucenou).
  const [manualExVatRaw, setManualExVatRaw] = useState<string>(
    manualExVat > 0 ? manualExVat.toFixed(2) : ''
  );
  // Sync raw kdyz manualPrice prijde ze serveru (resync po PATCH/router.refresh).
  // Jen pokud parsed raw != committed → jinak by se kurzor resetoval pri kazdem typing.
  useEffect(() => {
    const committedExVat = manualExVat;
    const parsedRaw = parseDecimalCs(manualExVatRaw);
    if (Number.isFinite(parsedRaw) && Math.abs(parsedRaw - committedExVat) < 0.005) return;
    setManualExVatRaw(committedExVat > 0 ? committedExVat.toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPrice]);
  // Commit na blur: parse raw + ulozit do formData jako s DPH.
  function commitManualExVat() {
    const raw = manualExVatRaw.trim();
    if (raw === '') {
      if (manualPrice !== '') setManualPrice('');
      return;
    }
    const n = parseDecimalCs(raw);
    if (!Number.isFinite(n) || n <= 0) {
      // Invalid → vrat raw na puvodni committed value
      setManualExVatRaw(manualExVat > 0 ? manualExVat.toFixed(2) : '');
      return;
    }
    const inclVat = (n * vatMultiplier).toFixed(2);
    setManualPrice(inclVat);
    // Pre-format raw na pevne 2 desetiny — konzistentni display
    setManualExVatRaw(n.toFixed(2));
  }

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
        {/* 1. Cena nákupní — READONLY (vypocet z cenotvorby zakazky/kazety). */}
        {/* Editovatelne je jen „Cena speciální" niz. */}
        <PriceRow
          label="Cena nákupní"
          hint={'Spočítáno z cenotvorby zakázky/kazety (váha × Kč/g). Pro vlastní cenu použij pole „Cena speciální" níže.'}
          editable={false}
          displayValue={fmt(purchasePrice)}
          emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
        />

        {/* 1b. Cena nákupní za gram — READONLY (zděděno z kazety/zakázky). */}
        <PriceRow
          label="Cena nákupní za gram"
          hint="Dědí se z kazety nebo zakázky. Mění se v Cenotvorbě zakázky, ne tady."
          editable={false}
          displayValue={ppgOverride && Number(ppgOverride) > 0 ? `${ppgOverride} Kč/g` : (usedPpgHint ? `${usedPpgHint} Kč/g` : '—')}
          emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
        />

        {/* 2. Cena s náklady */}
        <PriceRow
          label="Cena s náklady"
          hint="Nákupní cena + alokovaný podíl na společných nákladech zakázky (doprava, certifikace…)."
          editable={false}
          displayValue={fmt(costBasisCzk)}
          emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
          rightExtra={
            costBasisCzk && Number(costBasisCzk) > 0 && purchasePrice && Number(purchasePrice) > 0 ? (
              (() => {
                const cb = Number(costBasisCzk);
                const pp = Number(purchasePrice);
                const alloc = Math.max(cb - pp, 0);
                return (
                  <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
                    {fmt(String(pp))} nákupní {alloc > 0 ? `+ ${fmt(String(alloc))} alokace nákladů` : '· bez alokace'}
                  </span>
                );
              })()
            ) : null
          }
        />

        {/* 3a. Cena prodejní bez DPH — READONLY (computedMinPriceExVatCzk).
            Samostatny radek pro lepsi prehlednost; finalni s DPH je na dalsim radku. */}
        {(() => {
          const rec = Number(recommendedPriceInclVatCzk ?? 0);
          const exVatStored = computedMinPriceExVatCzk ? Number(computedMinPriceExVatCzk) : null;
          const exVat = exVatStored && exVatStored > 0
            ? exVatStored
            : rec > 0 ? rec / 1.21 : 0;
          const vat = rec - exVat;
          return (
            <>
              <PriceRow
                label="Cena prodejní bez DPH"
                hint="Doporučená cena před přidáním DPH — pro účetnictví / fakturaci."
                editable={false}
                displayValue={exVat > 0 ? fmt(String(exVat)) : '—'}
                emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
              />

              {/* 3b. Cena prodejní s DPH — READONLY. To je co user vidi v eshopu. */}
              <PriceRow
                label="Cena prodejní s DPH"
                hint={'Spočítáno cenotvorbou — pro eshop / Etsy. Pro vlastní cenu nad doporučenou použij pole „Cena speciální" níže.'}
                editable={false}
                displayValue={fmt(salePrice)}
                emptyHint="Spočítá se po přepočtu cenotvorby zakázky."
                rightExtra={
                  recommendedPriceInclVatCzk && rec > 0 ? (
                    (() => {
                      const sale = Number(salePrice);
                      const matches = sale > 0 && Math.abs(sale - rec) < 0.5;
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: matches ? 'var(--success)' : 'var(--muted-foreground)' }}>
                              {matches ? `✓ odpovídá doporučené (${fmt(recommendedPriceInclVatCzk)})` : `doporučená: ${fmt(recommendedPriceInclVatCzk)}`}
                            </span>
                            <BreakdownTooltip breakdown={priceCalcBreakdown} />
                          </span>
                          {vat > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                              {fmt(String(exVat))} bez DPH + {fmt(String(vat))} DPH = {fmt(String(rec))} s DPH
                            </span>
                          )}
                        </div>
                      );
                    })()
                  ) : null
                }
              />
            </>
          );
        })()}

        {/* 4. Cena speciální — uzivatel zadava BEZ DPH; ulozi se s DPH.
            Vlastni inline input (ne PriceRow) kvuli lokalnimu raw state — bez nej
            kazdy keystroke prepisuje text pres conversion-roundtrip a kurzor skace.
            Commit (a warning „pod doporucenou") az na BLUR. */}
        <div className="grid grid-cols-[1fr_10rem] items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Cena speciální (bez DPH)</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
              Mimořádně vyšší cena pro výjimečně pěkné kameny (override doporučené). Zadáváš bez DPH, s DPH se dopočte níže.
            </p>
            {manualBelowRecommended && (
              <p
                className="text-[10px] text-warning font-mono whitespace-nowrap mt-0.5"
                title="Speciální cena je pod doporučeným minimem — kámen bude označen NEEDS_REVIEW"
              >
                ⚠ pod doporučenou
              </p>
            )}
          </div>
          <div className="w-full">
            <input
              type="text"
              inputMode="decimal"
              value={manualExVatRaw}
              onChange={(e) => setManualExVatRaw(e.target.value)}
              onBlur={commitManualExVat}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="—"
              className="w-full bg-card border border-border rounded-lg px-3 h-9 text-sm font-mono text-right text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>

        {/* 4b. Cena specialni s DPH — READONLY, automaticky dopocita z bez-DPH × (1 + vatRate/100). */}
        <PriceRow
          label="Cena speciální (s DPH)"
          hint={`Automaticky dopočteno z Ceny speciální × ${(vatMultiplier).toFixed(2)} (DPH ${vatRate}%).`}
          editable={false}
          displayValue={manualNum > 0 ? fmt(String(manualNum)) : '—'}
          emptyHint="Zadej Cenu speciální výše — s DPH se dopočte."
          rightExtra={
            manualExVat > 0 && manualNum > 0 ? (
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                {fmt(String(manualExVat))} bez DPH × {(vatMultiplier).toFixed(2)} = {fmt(String(manualNum))} s DPH
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
 * CSS-only popover (group-hover) — instant zobrazeni, bez React state.
 */
function BreakdownTooltip({ breakdown }: { breakdown: unknown }) {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const b = breakdown as {
    marginBreakdown?: Array<{
      ruleKey: string;
      ruleLabel?: string | null;
      ruleType?: 'bracket' | 'category' | 'multi-category' | 'boolean';
      matched: string | null;
      marginRate: string;
    }>;
    totalMarginRate?: string;
    computedOnDemand?: boolean;
  };
  const rules = Array.isArray(b.marginBreakdown) ? b.marginBreakdown : [];
  if (rules.length === 0) return null;

  const fmtPct = (rate: string) => {
    const n = Number(rate);
    if (!Number.isFinite(n)) return rate;
    const pct = n * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  };

  // Lidsky popisek pravidla — preferuj label z PricingConfig, fallback na
  // překlad technického klíče.
  const FRIENDLY_KEY: Record<string, string> = {
    weightBracket: 'Hmotnost',
    pasShape: 'Tvar',
    location: 'Místo nálezu',
    attrDamage: 'Poškození',
    attrColor: 'Barva',
    attrCollectible: 'Sbírkový kámen',
  };
  const labelFor = (r: { ruleKey: string; ruleLabel?: string | null }) =>
    r.ruleLabel || FRIENDLY_KEY[r.ruleKey] || r.ruleKey;

  // Lidsky popisek matched value podle typu pravidla.
  const matchedLabel = (r: { ruleType?: string; matched: string | null }): string => {
    if (r.matched === null || r.matched === '') {
      if (r.ruleType === 'boolean') return 'ne';
      if (r.ruleType === 'multi-category') return 'nevybráno';
      return 'nevyplněno';
    }
    if (r.ruleType === 'boolean') {
      return r.matched === 'true' ? 'ano' : 'ne';
    }
    return r.matched;
  };

  return (
    <span className="relative inline-flex group">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help text-muted-foreground group-hover:text-foreground transition-colors"
        aria-label="Použité koeficienty cenotvorby"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      </span>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        <div className="bg-foreground text-background rounded-lg shadow-lg px-3 py-2 min-w-[260px] text-left">
          <p className="text-[10px] font-mono uppercase tracking-wider opacity-70 mb-1.5">
            Použité koeficienty cenotvorby
          </p>
          <ul className="space-y-0.5 text-xs">
            {rules.map((r, i) => {
              const matched = matchedLabel(r);
              const noMatch = r.matched === null || r.matched === '';
              return (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span>
                    <span>{labelFor(r)}: </span>
                    <span className={noMatch ? 'opacity-60 italic' : 'font-medium'}>{matched}</span>
                  </span>
                  <span className="font-mono font-semibold whitespace-nowrap">{fmtPct(r.marginRate)}</span>
                </li>
              );
            })}
          </ul>
          {b.totalMarginRate && (
            <div className="mt-1.5 pt-1.5 border-t border-background/20 flex items-baseline justify-between gap-3 text-xs">
              <span className="opacity-80">Celková marže:</span>
              <span className="font-mono font-bold">{fmtPct(b.totalMarginRate)}</span>
            </div>
          )}
          {b.computedOnDemand && (
            <p className="mt-1.5 text-[9px] opacity-60 italic">
              Spočítáno z aktuální cenotvorby — pro uložení do historie spusť „Přepočítat".
            </p>
          )}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-foreground rotate-45 -mt-1" />
        </div>
      </div>
    </span>
  );
}
