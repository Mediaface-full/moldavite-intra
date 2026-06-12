'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { getThumbnailUrl, getCatalogNumber } from '@/lib/utils';
import { PAS_SHAPES, pasShapeCz } from '@/lib/pasShapes';
import AiButton from './AiButton';
import { apiFetch } from '@/lib/apiFetch';

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
  box?: { code: string };
}

interface ItemsTableProps {
  items: Item[];
  boxCode?: string;
  isAdmin?: boolean;
}

export default function ItemsTable({ items: initialItems, boxCode, isAdmin = true }: ItemsTableProps) {
  const [localItems, setLocalItems] = useState(initialItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [pasFilter, setPasFilter] = useState<string>(''); // '' = all, 'NONE' = not set, otherwise key
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
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

  const handleBulkApply = useCallback(async (data: { description?: string; location?: string; storage?: string; pasShape?: string }) => {
    setBulkSaving(true);
    try {
      // Apply only to currently visible (filtered) items so PAS filter can scope
      // the operation, e.g. "set Kapka for only currently shown stones".
      const targetItems = filteredItems;
      for (const item of targetItems) {
        const fields: Record<string, string> = {};
        if (data.description) fields.description = data.description;
        if (data.location) fields.location = data.location;
        if (data.storage) fields.storage = data.storage;
        if (data.pasShape !== undefined) fields.pasShape = data.pasShape;
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
              placeholder="Hledat kameny..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-4 py-2 pl-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-moldavite-500"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <select
            value={pasFilter}
            onChange={(e) => setPasFilter(e.target.value)}
            title="Filtrovat podle primárního tvaru"
            className="bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500"
          >
            <option value="">Všechny tvary</option>
            <option value="NONE">— bez tvaru —</option>
            {PAS_SHAPES.map((s) => (
              <option key={s.key} value={s.key}>{s.cz}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-bg-secondary border border-border-color hover:border-border-hover text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Propsat údaje
          </button>

          <button
            onClick={() => setAllField('onShop', true)}
            className="bg-moldavite-700 hover:bg-moldavite-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Vystavit vše na eshop
          </button>
          <button
            onClick={() => setAllField('onShop', false)}
            className="bg-bg-secondary border border-border-color hover:border-border-hover text-text-secondary px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Vypnout z eshopu
          </button>

          <button
            onClick={() => setAllField('onEtsy', true)}
            className="bg-orange-700 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Vystavit vše na Etsy
          </button>
          <button
            onClick={() => setAllField('onEtsy', false)}
            className="bg-bg-secondary border border-border-color hover:border-border-hover text-text-secondary px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Vypnout z Etsy
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-secondary border-b border-border-color">
              <th className="text-left px-3 py-3 text-text-secondary font-medium w-14">Foto</th>
              <th className="text-left px-3 py-3 text-text-secondary font-medium">Kat. č.</th>
              <th className="text-left px-3 py-3 text-text-secondary font-medium">Místo nálezu</th>
              <th className="text-left px-3 py-3 text-text-secondary font-medium w-36">Tvar (PAS)</th>
              <th className="text-right px-3 py-3 text-text-secondary font-medium">Hmotnost (g)</th>
              {isAdmin && (
                <th className="text-right px-3 py-3 text-text-secondary font-medium">Nákupka</th>
              )}
              <th className="text-right px-3 py-3 text-text-secondary font-medium">Prodejka</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium">Eshop</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium">Etsy</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium w-20"></th>
              {isAdmin && <th className="px-2 py-3 text-text-secondary font-medium w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className={`border-b border-border-color hover:bg-bg-card-hover transition-colors ${item.sold ? 'opacity-50' : ''}`}>
                {/* Thumbnail */}
                <td className="px-3 py-2">
                  <Link href={`/items/${item.id}`}>
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-white border border-border-color">
                      {item.photoPath ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={getThumbnailUrl(item.photoPath, item.mainPhoto)} alt={item.evidNumber} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">N/A</div>
                      )}
                    </div>
                  </Link>
                </td>

                {/* Catalog Number */}
                <td className="px-3 py-2">
                  <Link href={`/items/${item.id}`} className="text-foreground hover:text-primary font-mono font-semibold transition-colors text-xs tracking-tight">
                    {getCatalogNumber(getBoxCode(item), item.evidNumber)}
                  </Link>
                </td>

                {/* Location */}
                <td className="px-3 py-2 text-text-secondary">{item.location || '-'}</td>

                {/* PAS shape — inline select */}
                <td className="px-3 py-2">
                  <select
                    value={item.pasShape || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, pasShape: v } : i));
                      autoSave(item.id, 'pasShape', v);
                    }}
                    className="w-full bg-bg-secondary border border-border-color rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-moldavite-500"
                  >
                    <option value="">—</option>
                    {PAS_SHAPES.map((s) => (
                      <option key={s.key} value={s.key}>{s.cz}</option>
                    ))}
                  </select>
                </td>

                {/* Weight */}
                <td className="px-3 py-2 text-right">
                  <ZeroInput
                    step="0.01" width="w-20"
                    initial={typeof item.weight === 'string' ? parseFloat(item.weight) : item.weight}
                    onSave={(v) => autoSave(item.id, 'weight', v)}
                  />
                </td>

                {/* Purchase Price */}
                {isAdmin && (
                  <td className="px-3 py-2 text-right">
                    <ZeroInput
                      width="w-24"
                      initial={typeof item.purchasePrice === 'string' ? parseFloat(item.purchasePrice) : item.purchasePrice}
                      onSave={(v) => autoSave(item.id, 'purchasePrice', v)}
                    />
                  </td>
                )}

                {/* Sale Price */}
                <td className="px-3 py-2 text-right">
                  <ZeroInput
                    width="w-24"
                    initial={typeof item.salePrice === 'string' ? parseFloat(item.salePrice) : item.salePrice}
                    onSave={(v) => autoSave(item.id, 'salePrice', v)}
                  />
                </td>

                {/* Eshop Toggle - disabled if sold */}
                <td className="px-3 py-2 text-center">
                  {item.sold ? (
                    <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted opacity-50 cursor-not-allowed ring-1 ring-inset ring-border">
                      <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-muted-foreground/40 translate-x-0.5" />
                    </span>
                  ) : (
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
                  )}
                </td>

                {/* Etsy Toggle - disabled if sold */}
                <td className="px-3 py-2 text-center">
                  {item.sold ? (
                    <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted opacity-50 cursor-not-allowed ring-1 ring-inset ring-border">
                      <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-muted-foreground/40 translate-x-0.5" />
                    </span>
                  ) : (
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
                  )}
                </td>

                {/* Sold button - only one-way in table (mark as sold, unmark only from detail) */}
                <td className="px-3 py-2 text-center">
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
                  <td className="px-2 py-2 text-center">
                    <AiButton itemId={item.id} catalogNumber={getCatalogNumber(getBoxCode(item), item.evidNumber)} size="sm" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm text-text-muted">
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
  onApply: (data: { description?: string; location?: string; storage?: string; pasShape?: string }) => void;
  saving: boolean;
}) {
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [storage, setStorage] = useState('');
  const [pasShape, setPasShape] = useState<string>('__unchanged__'); // special marker: don't change

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-card border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Propsat údaje ke všem kamenům</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Vyplněné hodnoty se propíšou do všech <strong>{itemCount}</strong> kamenů. Prázdná pole se přeskočí.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Popis</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Propsat popis ke všem..."
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500 resize-none placeholder-text-muted" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Místo nálezu</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Propsat místo ke všem..."
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500 placeholder-text-muted" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Umístění</label>
            <input type="text" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Propsat umístění ke všem..."
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500 placeholder-text-muted" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1 uppercase tracking-wider">Primární tvar (PAS)</label>
            <select value={pasShape} onChange={(e) => setPasShape(e.target.value)}
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500">
              <option value="__unchanged__">— neměnit —</option>
              <option value="">— smazat / nenastaveno —</option>
              {PAS_SHAPES.map((s) => (
                <option key={s.key} value={s.key}>{s.cz} ({s.en})</option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              Propíše se pouze do kamenů zobrazených v aktuálním filtru ({itemCount}).
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => onApply({
              description,
              location,
              storage,
              ...(pasShape !== '__unchanged__' ? { pasShape } : {}),
            })}
            disabled={saving || (!description && !location && !storage && pasShape === '__unchanged__')}
            className="flex-1 bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Ukládám...' : 'Propsat ke všem kamenům'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary border border-border-color hover:border-border-hover transition-colors">
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}

function ZeroInput({ initial, onSave, step, width }: {
  initial: number; onSave: (v: number) => void; step?: string; width?: string;
}) {
  const [display, setDisplay] = useState(initial === 0 ? '' : String(initial));
  const [focused, setFocused] = useState(false);

  const shown = focused ? display : (display === '' || display === '0' ? '' : display);

  return (
    <input
      type="number"
      step={step}
      value={shown}
      placeholder="0"
      onChange={(e) => setDisplay(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        const num = parseFloat(e.target.value) || 0;
        setDisplay(num === 0 ? '' : String(num));
        onSave(num);
      }}
      className={`${width || 'w-24'} bg-bg-secondary border border-border-color rounded px-2 py-1 text-right text-sm text-text-primary focus:outline-none focus:border-moldavite-500 placeholder-text-muted`}
    />
  );
}
