'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { PAS_SHAPES, getPasShape } from '@/lib/pasShapes';
import dynamic from 'next/dynamic';
import AutocompleteInput from './AutocompleteInput';
import { apiFetch } from '@/lib/apiFetch';

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
  box: { code: string; id: number };
  priceEUR?: number;
  priceUSD?: number;
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

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
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

        {/* Location + Storage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Místo nálezu</label>
            <AutocompleteInput
              value={formData.location}
              onChange={(v) => setFormData((f) => ({ ...f, location: v }))}
              field="location"
              placeholder="Místo nálezu..."
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Umístění</label>
            <AutocompleteInput
              value={formData.storage}
              onChange={(v) => setFormData((f) => ({ ...f, storage: v }))}
              field="storage"
              placeholder="Kde je kámen uložen..."
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground transition-shadow"
            />
          </div>
        </div>

        {/* Primary Aerodynamic Shape */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">
            Primární aerodynamický tvar (PAS)
            <span className="ml-2 text-[10px] text-muted-foreground normal-case">
              {lang === 'en' ? 'shown to English buyers:' : 'anglický název pro export:'}
              <strong className="ml-1 text-muted-foreground">
                {getPasShape(formData.pasShape)?.[lang === 'en' ? 'en' : 'cz'] || (lang === 'en' ? 'not set' : 'nenastaveno')}
              </strong>
            </span>
          </label>
          <select
            value={formData.pasShape}
            onChange={(e) => setFormData((f) => ({ ...f, pasShape: e.target.value }))}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
          >
            <option value="">— nezvoleno —</option>
            {PAS_SHAPES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.cz} ({s.en})
              </option>
            ))}
          </select>
          {formData.pasShape && (
            <p className="mt-1.5 text-xs text-muted-foreground italic">
              {lang === 'en' ? getPasShape(formData.pasShape)?.descEn : getPasShape(formData.pasShape)?.descCz}
            </p>
          )}
        </div>

        {/* Weight + Prices */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Hmotnost (g)</label>
            <input type="number" step="0.01" value={formData.weight}
              onChange={(e) => setFormData((f) => ({ ...f, weight: e.target.value }))}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Hmotnost (ct)</label>
            <div className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground">
              {(parseFloat(formData.weight) * 5 || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Nákupní cena</label>
            <input type="number" value={formData.purchasePrice}
              onChange={(e) => setFormData((f) => ({ ...f, purchasePrice: e.target.value }))}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Prodejní cena</label>
            <input type="number" value={formData.salePrice}
              onChange={(e) => setFormData((f) => ({ ...f, salePrice: e.target.value }))}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
            />
          </div>
        </div>

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

          <div className="flex items-center justify-between">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider font-mono">Vystavit na Eshop</label>
              <p className="text-xs text-muted-foreground">Prodejní cena: {formatPrice(formData.salePrice)}</p>
            </div>
            <button
              onClick={() => setFormData((f) => ({ ...f, onShop: !f.onShop }))}
              style={formData.onShop ? { background: 'var(--success)' } : undefined}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ring-inset ${
                formData.onShop ? 'ring-transparent' : 'bg-muted ring-border'
              }`}
              aria-label="Vystavit na Eshop"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                formData.onShop ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Vystavit na Etsy</label>
            <button
              onClick={() => setFormData((f) => ({ ...f, onEtsy: !f.onEtsy }))}
              style={formData.onEtsy ? { background: 'var(--warning)' } : undefined}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ring-inset ${
                formData.onEtsy ? 'ring-transparent' : 'bg-muted ring-border'
              }`}
              aria-label="Vystavit na Etsy"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                formData.onEtsy ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
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
