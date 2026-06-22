'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getThumbnailUrl, getCatalogNumber } from '@/lib/utils';
import { pasShapeCz } from '@/lib/pasShapes';
import SafeImage from './SafeImage';
import AiButton from './AiButton';
import AttrMultiSelect from './AttrMultiSelect';
import Icon from './Icon';
import { apiFetch } from '@/lib/apiFetch';

// Buňky ve kterých je interaktivní prvek (input, select, button, toggle) —
// klik nesmí propagovat na řádek, aby uživatel mohl klidně editovat.
function stopRowClick(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation();
}

interface Item {
  id: number;
  evidNumber: string;
  description: string;
  location: string;
  storage: string;
  purchasePrice: string | number;
  salePrice: string | number;
  weight: string | number;
  sold: boolean;
  onShop: boolean;
  onEtsy: boolean;
  mainPhoto: number;
  photoPath: string;
  pasShape?: string;
  // Pricing status + povinna evidencni pole — pro „Stav" sloupec s warning trojuhelnikem.
  // Volitelne (optional) kvuli zpetne kompatibilite legacy mist (Boxes index, atd.)
  // ktera ItemsTable pouzivaji bez tehle dat.
  pricingStatus?: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE';
  attrDamage?: string;
  attrColor?: string[];
  box?: { code: string };
}

/** Vyjmenuje povinna evidencni pole co kameni chybi pro stav K REVIZI. */
function listMissingRequired(item: Item): string[] {
  const missing: string[] = [];
  if (!item.pasShape) missing.push('tvar');
  if (item.attrDamage !== undefined && !item.attrDamage) missing.push('poškození');
  if (item.attrColor !== undefined && (!item.attrColor || item.attrColor.length === 0)) missing.push('barva');
  if (!item.location) missing.push('místo nálezu');
  const weight = typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight;
  if (!Number.isFinite(weight) || weight <= 0) missing.push('váha');
  return missing;
}

interface ItemsTableProps {
  items: Item[];
  boxCode?: string;
  isAdmin?: boolean;
}

export default function ItemsTable({ items: initialItems, boxCode, isAdmin = true }: ItemsTableProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(initialItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [pasFilter, setPasFilter] = useState<string>(''); // '' = all, 'NONE' = not set, otherwise value
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  // Tvary kamene z AttrOption — jediný zdroj pravdy (admin /admin/attributes).
  // Předchozí hardcoded PAS_SHAPES (pasShapes.ts) drift vůči seedu způsobil
  // že ItemsTable nabízel jiné hodnoty než /admin/attributes a ItemDetailForm.
  const [pasOptions, setPasOptions] = useState<Array<{ value: string }>>([]);
  useEffect(() => {
    apiFetch('/api/attr-options?key=pasShape').then(async (r) => {
      if (r.ok) setPasOptions(await r.json());
    });
  }, []);
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const filteredItems = useMemo(() => localItems.filter((item) => {
    if (pasFilter) {
      const current = item.pasShape || '';
      if (pasFilter === 'NONE' && current !== '') return false;
      if (pasFilter !== 'NONE' && current !== pasFilter) return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.evidNumber.includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q)
    );
  }), [localItems, searchQuery, pasFilter]);

  const autoSave = useCallback(async (itemId: number, field: string, value: unknown) => {
    const key = `${itemId}-${field}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      try {
        await apiFetch(`/api/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 100);
  }, []);

  const toggleField = useCallback(async (itemId: number, field: string, currentValue: boolean) => {
    // Block enabling eshop/etsy without weight and price
    if ((field === 'onShop' || field === 'onEtsy') && !currentValue) {
      const item = localItems.find(i => i.id === itemId);
      if (item) {
        const weight = typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight;
        const price = typeof item.salePrice === 'string' ? parseFloat(item.salePrice) : item.salePrice;
        if (!weight || weight <= 0) {
          alert('Nelze vystavit na shop - kámen nemá nastavenou hmotnost.');
          return;
        }
        if (!price || price <= 0) {
          alert('Nelze vystavit na shop - kámen nemá nastavenou prodejní cenu.');
          return;
        }
      }
    }
    // Optimistic update
    setLocalItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: !currentValue } : item
    ));
    try {
      await apiFetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !currentValue }),
      });
    } catch (err) {
      // Revert on error
      setLocalItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, [field]: currentValue } : item
      ));
      console.error('Toggle failed:', err);
    }
  }, [localItems]);

  const setAllField = useCallback(async (field: string, value: boolean) => {
    // Skip sold items and items without weight/price when enabling
    let eligible = localItems;
    if ((field === 'onShop' || field === 'onEtsy') && value) {
      eligible = localItems.filter((item) => {
        if (item.sold) return false;
        const w = typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight;
        const p = typeof item.salePrice === 'string' ? parseFloat(item.salePrice) : item.salePrice;
        return w > 0 && p > 0;
      });
      const skipped = localItems.filter(i => !i.sold).length - eligible.length;
      if (skipped > 0) {
        alert(`${eligible.length} kamenů vystaveno. ${skipped} přeskočeno (chybí hmotnost nebo cena).`);
      }
      if (eligible.length === 0) return;
    }
    const updates = eligible.map((item) => ({ id: item.id, [field]: value }));
    // Optimistic update
    const eligibleIds = new Set(eligible.map(i => i.id));
    setLocalItems(prev => prev.map(item =>
      eligibleIds.has(item.id) ? { ...item, [field]: value } : item
    ));
    try {
      await apiFetch('/api/items/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
    } catch (err) {
      console.error('Bulk update failed:', err);
      window.location.reload();
    }
  }, [localItems]);

  const handleBulkApply = useCallback(async (data: {
    description?: string;
    location?: string;
    storage?: string;
    pasShape?: string;
    attrDamage?: string;
    attrColor?: string[];
  }) => {
    setBulkSaving(true);
    try {
      // Apply only to currently visible (filtered) items so PAS filter can scope
      // the operation, e.g. "set Kapka for only currently shown stones".
      const targetItems = filteredItems;
      for (const item of targetItems) {
        const fields: Record<string, unknown> = {};
        if (data.description) fields.description = data.description;
        if (data.location) fields.location = data.location;
        if (data.storage) fields.storage = data.storage;
        if (data.pasShape !== undefined) fields.pasShape = data.pasShape;
        if (data.attrDamage !== undefined) fields.attrDamage = data.attrDamage;
        if (data.attrColor !== undefined) fields.attrColor = data.attrColor;
        if (Object.keys(fields).length > 0) {
          await apiFetch(`/api/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
          });
        }
      }
      // Optimistic update
      const targetIds = new Set(targetItems.map((i) => i.id));
      setLocalItems(prev => prev.map(item => {
        if (!targetIds.has(item.id)) return item;
        const updated = { ...item };
        if (data.description) updated.description = data.description;
        if (data.location) updated.location = data.location;
        if (data.storage) updated.storage = data.storage;
        if (data.pasShape !== undefined) updated.pasShape = data.pasShape;
        // attrDamage/attrColor zatím nejsou v Item interface lokální tabulky —
        // optimistic update přeskočíme, refresh dotáhne při dalším loadu.
        return updated;
      }));
      setShowBulkModal(false);
    } catch (err) {
      console.error('Bulk apply failed:', err);
    } finally {
      setBulkSaving(false);
    }
  }, [filteredItems]);

  const getBoxCode = (item: Item) => boxCode || item.box?.code || '';

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Hledat kameny…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-4 py-2 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <select
            value={pasFilter}
            onChange={(e) => setPasFilter(e.target.value)}
            title="Filtrovat podle primárního tvaru"
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
          >
            <option value="">Všechny tvary</option>
            <option value="NONE">— bez tvaru —</option>
            {pasOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            Propsat údaje
          </button>

          <button
            onClick={() => setAllField('onShop', true)}
            style={{ color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)' }}
            className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Eshop vše ON
          </button>
          <button
            onClick={() => setAllField('onShop', false)}
            className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Eshop vše OFF
          </button>

          <button
            onClick={() => setAllField('onEtsy', true)}
            style={{ color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}
            className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Etsy vše ON
          </button>
          <button
            onClick={() => setAllField('onEtsy', false)}
            className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Etsy vše OFF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-center px-2 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider w-8" title="Stav cenotvorby">⚠</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider w-14">Foto</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Kat. č.</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Místo nálezu</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider w-36">Tvar (PAS)</th>
              <th className="text-right px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Hmotnost (g)</th>
              {isAdmin && (
                <th className="text-right px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Nákupka</th>
              )}
              <th className="text-right px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Prodejka</th>
              <th className="text-center px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Eshop</th>
              <th className="text-center px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider">Etsy</th>
              <th className="text-center px-3 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider w-20"></th>
              {isAdmin && <th className="px-2 py-3 text-muted-foreground font-mono text-[10px] uppercase tracking-wider w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                onClick={() => router.push(`/items/${item.id}`)}
                className={`border-b border-border hover:bg-muted/40 transition-colors cursor-pointer ${item.sold ? 'opacity-50' : ''}`}
              >
                {/* Stav cenotvorby — varovny trojuhelnik pro NEEDS_INPUT/NEEDS_REVIEW,
                    zeleny checkmark pro OK, info icon pro STALE. Bez statusu = null. */}
                <td className="px-2 py-2 text-center" onClick={stopRowClick}>
                  {(() => {
                    const status = item.pricingStatus;
                    if (!status) return null;
                    if (status === 'OK') {
                      return (
                        <span
                          title="Vše vyplněno, cena spočítaná"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full"
                          style={{
                            background: 'color-mix(in srgb, var(--success) 14%, transparent)',
                            border: '1.5px solid var(--success)',
                            color: 'var(--success)',
                          }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      );
                    }
                    if (status === 'STALE') {
                      return (
                        <Link
                          href={`/items/${item.id}`}
                          title="Cena je zastaralá — spusť Přepočítat v zakázce"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:opacity-80 transition-opacity"
                          style={{
                            background: 'color-mix(in srgb, var(--info) 14%, transparent)',
                            border: '1.5px solid var(--info)',
                            color: 'var(--info)',
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                          </svg>
                        </Link>
                      );
                    }
                    const missing = listMissingRequired(item);
                    const tooltip = missing.length > 0
                      ? `${status === 'NEEDS_INPUT' ? 'Chybí' : 'K revizi'}: ${missing.join(', ')}`
                      : status === 'NEEDS_INPUT' ? 'Chybí vstupy pro cenu' : 'K revizi';
                    const color = 'var(--warning)';
                    return (
                      <Link
                        href={`/items/${item.id}`}
                        title={tooltip}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full cursor-help hover:opacity-80 transition-opacity"
                        style={{
                          background: `color-mix(in srgb, ${color} 18%, transparent)`,
                          border: `1.5px solid ${color}`,
                          color,
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </Link>
                    );
                  })()}
                </td>

                {/* Thumbnail */}
                <td className="px-3 py-2">
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-white border border-border">
                    {item.photoPath ? (
                      <SafeImage
                        src={getThumbnailUrl(item.photoPath, item.mainPhoto)}
                        alt={item.evidNumber}
                        className="object-cover w-full h-full"
                        placeholder="minimal"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
                    )}
                  </div>
                </td>

                {/* Catalog Number */}
                <td className="px-3 py-2">
                  <span className="text-foreground font-mono font-semibold text-xs tracking-tight">
                    {getCatalogNumber(getBoxCode(item), item.evidNumber)}
                  </span>
                </td>

                {/* Location */}
                <td className="px-3 py-2 text-muted-foreground">{item.location || '-'}</td>

                {/* PAS shape — READONLY (pro hromadnou editaci pouzij modal vyse, pro per-kamen detail). */}
                <td className="px-3 py-2">
                  <span
                    className="inline-block px-2 py-1 text-xs text-foreground"
                    title="Edituj na kartě kamene nebo přes Hromadnou editaci"
                  >
                    {item.pasShape || <span className="text-muted-foreground/60">—</span>}
                  </span>
                </td>

                {/* Weight — READONLY */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="inline-block w-20 px-2 py-1 font-mono text-xs text-foreground text-right"
                    title="Edituj na kartě kamene nebo přes Hromadnou editaci"
                  >
                    {(() => {
                      const w = typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight;
                      return Number.isFinite(w) && w > 0 ? w.toFixed(2) : '—';
                    })()}
                  </span>
                </td>

                {/* Purchase Price — READONLY (vypocet z cenotvorby zakazky/kazety) */}
                {isAdmin && (
                  <td className="px-3 py-2 text-right">
                    <span
                      className="inline-block w-24 px-2 py-1 font-mono text-xs text-foreground text-right"
                      title="Spočítáno z cenotvorby — nelze editovat. Pro vlastní cenu použij Cenu speciální na detailu kamene."
                    >
                      {(() => {
                        const v = typeof item.purchasePrice === 'string' ? parseFloat(item.purchasePrice) : item.purchasePrice;
                        return v > 0 ? Math.round(v).toLocaleString('cs-CZ') : '—';
                      })()}
                    </span>
                  </td>
                )}

                {/* Sale Price — READONLY (vypocet z cenotvorby) */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="inline-block w-24 px-2 py-1 font-mono text-xs text-foreground text-right"
                    title="Spočítáno z cenotvorby — nelze editovat. Pro vlastní cenu použij Cenu speciální na detailu kamene."
                  >
                    {(() => {
                      const v = typeof item.salePrice === 'string' ? parseFloat(item.salePrice) : item.salePrice;
                      return v > 0 ? Math.round(v).toLocaleString('cs-CZ') : '—';
                    })()}
                  </span>
                </td>

                {/* Eshop Toggle - disabled if sold, prodáno nebo kámen není OK */}
                {/* Server-side gate: PATCH item odmítne onShop=true kdyz pricingStatus != OK */}
                <td className="px-3 py-2 text-center" onClick={stopRowClick}>
                  {(() => {
                    const blocked = item.sold
                      || (item.pricingStatus && item.pricingStatus !== 'OK' && item.pricingStatus !== 'STALE');
                    if (blocked) {
                      return (
                        <span
                          className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted opacity-50 cursor-not-allowed ring-1 ring-inset ring-border"
                          title={item.sold ? 'Kámen je prodán' : 'Dopiš povinné údaje a spusť Přepočítat'}
                        >
                          <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-muted-foreground/40 translate-x-0.5" />
                        </span>
                      );
                    }
                    return (
                      <button
                        onClick={() => toggleField(item.id, 'onShop', item.onShop)}
                        style={item.onShop ? { background: 'var(--success)' } : undefined}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ring-1 ring-inset ${
                          item.onShop ? 'ring-transparent' : 'bg-muted ring-border'
                        }`}
                        aria-label="Vystaveno na eshopu"
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow-sm transition-transform ${
                          item.onShop ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`} />
                      </button>
                    );
                  })()}
                </td>

                {/* Etsy Toggle - stejný gating jako Eshop */}
                <td className="px-3 py-2 text-center" onClick={stopRowClick}>
                  {(() => {
                    const blocked = item.sold
                      || (item.pricingStatus && item.pricingStatus !== 'OK' && item.pricingStatus !== 'STALE');
                    if (blocked) {
                      return (
                        <span
                          className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted opacity-50 cursor-not-allowed ring-1 ring-inset ring-border"
                          title={item.sold ? 'Kámen je prodán' : 'Dopiš povinné údaje a spusť Přepočítat'}
                        >
                          <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-muted-foreground/40 translate-x-0.5" />
                        </span>
                      );
                    }
                    return (
                      <button
                        onClick={() => toggleField(item.id, 'onEtsy', item.onEtsy)}
                        style={item.onEtsy ? { background: 'var(--warning)' } : undefined}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ring-1 ring-inset ${
                          item.onEtsy ? 'ring-transparent' : 'bg-muted ring-border'
                        }`}
                        aria-label="Vystaveno na Etsy"
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow-sm transition-transform ${
                          item.onEtsy ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`} />
                      </button>
                    );
                  })()}
                </td>

                {/* Sold button - only one-way in table (mark as sold, unmark only from detail) */}
                <td className="px-3 py-2 text-center" onClick={stopRowClick}>
                  {item.sold ? (
                    <span
                      style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}
                      className="px-2 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider border"
                    >
                      Prodáno
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm('Označit kámen jako prodaný? Vypne se ze všech exportů.')) {
                          toggleField(item.id, 'sold', false);
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-transparent border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                    >
                      Prodat
                    </button>
                  )}
                </td>

                {/* AI button - admin only */}
                {isAdmin && (
                  <td className="px-2 py-2 text-center" onClick={stopRowClick}>
                    <AiButton itemId={item.id} catalogNumber={getCatalogNumber(getBoxCode(item), item.evidNumber)} size="sm" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm text-muted-foreground">
        Zobrazeno {filteredItems.length} z {localItems.length} kamenů
      </div>

      {showBulkModal && (
        <BulkEditModal
          itemCount={localItems.length}
          onClose={() => setShowBulkModal(false)}
          onApply={handleBulkApply}
          saving={bulkSaving}
        />
      )}
    </div>
  );
}

function BulkEditModal({
  itemCount, onClose, onApply, saving,
}: {
  itemCount: number;
  onClose: () => void;
  onApply: (data: { description?: string; location?: string; storage?: string; pasShape?: string; attrDamage?: string; attrColor?: string[] }) => void;
  saving: boolean;
}) {
  const [description, setDescription] = useState('');
  const [storage, setStorage] = useState('');
  // '__unchanged__' = nech beze změny, '' = smaž hodnotu, jinak = nastav
  const [pasShape, setPasShape] = useState<string>('__unchanged__');
  const [attrDamage, setAttrDamage] = useState<string>('__unchanged__');
  const [location, setLocation] = useState<string>('__unchanged__');
  // Barvy: null = neměnit, [] = vymazat, ['x', 'y'] = nastavit
  const [attrColorMode, setAttrColorMode] = useState<'unchanged' | 'set'>('unchanged');
  const [attrColor, setAttrColor] = useState<string[]>([]);

  const hasAnything =
    description !== '' ||
    storage !== '' ||
    pasShape !== '__unchanged__' ||
    attrDamage !== '__unchanged__' ||
    location !== '__unchanged__' ||
    attrColorMode === 'set';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold inline-flex items-center gap-2">
            <Icon name="duplicate" className="w-5 h-5" />
            Propsat údaje ke všem kamenům
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Zavřít">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Vyplněné hodnoty se propíšou do všech <strong>{itemCount}</strong> kamenů zobrazených v aktuálním filtru. Pole označená <em>„— neměnit —"</em> se přeskočí.
        </p>
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="edit" className="w-3.5 h-3.5" />
              Popis
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Propsat popis ke všem… (prázdné = neměnit)"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 resize-none placeholder:text-muted-foreground" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="storage" className="w-3.5 h-3.5" />
              Umístění (fyzické)
            </label>
            <input type="text" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Kde je kámen uložen… (prázdné = neměnit)"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
                <Icon name="shape" className="w-3.5 h-3.5" />
                Tvar (PAS)
              </label>
              <UnchangedAttrSelect attrKey="pasShape" value={pasShape} onChange={setPasShape} />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
                <Icon name="damage" className="w-3.5 h-3.5" />
                Poškození
              </label>
              <UnchangedAttrSelect attrKey="attrDamage" value={attrDamage} onChange={setAttrDamage} />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
                <Icon name="location" className="w-3.5 h-3.5" />
                Místo nálezu
              </label>
              <UnchangedAttrSelect attrKey="location" value={location} onChange={setLocation} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              <Icon name="palette" className="w-3.5 h-3.5" />
              Barva
            </label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setAttrColorMode('unchanged')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                  attrColorMode === 'unchanged'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                Neměnit
              </button>
              <button
                type="button"
                onClick={() => setAttrColorMode('set')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                  attrColorMode === 'set'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                Nastavit (přepíše původní)
              </button>
            </div>
            {attrColorMode === 'set' && (
              <AttrMultiSelect attrKey="attrColor" value={attrColor} onChange={setAttrColor} />
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={() => onApply({
              ...(description ? { description } : {}),
              ...(storage ? { storage } : {}),
              ...(pasShape !== '__unchanged__' ? { pasShape } : {}),
              ...(attrDamage !== '__unchanged__' ? { attrDamage } : {}),
              ...(location !== '__unchanged__' ? { location } : {}),
              ...(attrColorMode === 'set' ? { attrColor } : {}),
            })}
            disabled={saving || !hasAnything}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <Icon name="duplicate" className="w-4 h-4" />
            {saving ? 'Ukládám…' : `Propsat do ${itemCount} kamenů`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 transition-colors">
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AttrSelect-wrapper s tří-stavovou logikou pro bulk modal:
 *   '__unchanged__' = nech beze změny (default, modal pole se přeskočí)
 *   ''              = smazat hodnotu na všech kamenech
 *   '<value>'       = nastavit konkrétní hodnotu z AttrOption
 */
function UnchangedAttrSelect({
  attrKey, value, onChange,
}: { attrKey: string; value: string; onChange: (v: string) => void }) {
  const [options, setOptions] = useState<Array<{ id: number; value: string }>>([]);
  React.useEffect(() => {
    let alive = true;
    apiFetch(`/api/attr-options?key=${attrKey}`).then(async (r) => {
      if (alive && r.ok) setOptions(await r.json());
    });
    return () => { alive = false; };
  }, [attrKey]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
    >
      <option value="__unchanged__">— neměnit —</option>
      <option value="">— smazat hodnotu —</option>
      {options.map((o) => (
        <option key={o.id} value={o.value}>{o.value}</option>
      ))}
    </select>
  );
}

function ZeroInput({ initial, onSave, step, width }: {
  initial: number; onSave: (v: number) => void; step?: string; width?: string;
}) {
  // Pro step="0.01" (váha, cena) formátuj na 2 desetiny při unfocused stavu.
  // Akceptuje českou desetinnou čárku I tečku (type="text" + inputMode="decimal").
  const fmt = (n: number): string => {
    if (n === 0) return '';
    return step === '0.01' ? n.toFixed(2) : String(n);
  };
  const [display, setDisplay] = useState(fmt(initial));
  const [focused, setFocused] = useState(false);

  const shown = focused ? display : (display === '' || display === '0' ? '' : display);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder="0"
      onChange={(e) => setDisplay(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        // Parse s podporou české desetinné čárky („3,5" → 3.5)
        const raw = e.target.value.trim().replace(',', '.');
        const num = parseFloat(raw) || 0;
        setDisplay(fmt(num));
        onSave(num);
      }}
      className={`${width || 'w-24'} bg-muted border border-border rounded px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground`}
    />
  );
}
