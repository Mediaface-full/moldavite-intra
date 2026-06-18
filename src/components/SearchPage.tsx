'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PAS_SHAPES } from '@/lib/pasShapes';
import Link from 'next/link';
import { getThumbnailUrl, getCatalogNumber, formatWeight, formatPrice } from '@/lib/utils';
import { apiFetch } from '@/lib/apiFetch';

interface SearchItem {
  id: number;
  evidNumber: string;
  description: string;
  location: string;
  storage: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
  sold: boolean;
  onShop: boolean;
  onEtsy: boolean;
  mainPhoto: number;
  photoPath: string;
  box: { code: string; id: number };
}

interface SearchResult {
  total: number;
  items: SearchItem[];
  grouped: Record<string, SearchItem[]>;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [boxCode, setBoxCode] = useState('');
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sold, setSold] = useState('');
  const [onShop, setOnShop] = useState('');
  const [onEtsy, setOnEtsy] = useState('');
  const [hasDescription, setHasDescription] = useState('');
  const [noPrice, setNoPrice] = useState(false);
  const [noWeight, setNoWeight] = useState(false);
  const [pasShape, setPasShape] = useState('');
  const [sortBy, setSortBy] = useState('evidNumber');
  const [sortDir, setSortDir] = useState('asc');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  const handleSearch = useCallback(async () => {
    setSearching(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (boxCode) params.set('box', boxCode);
    if (weightMin) params.set('weightMin', weightMin);
    if (weightMax) params.set('weightMax', weightMax);
    if (priceMin) params.set('priceMin', priceMin);
    if (priceMax) params.set('priceMax', priceMax);
    if (sold) params.set('sold', sold);
    if (onShop) params.set('onShop', onShop);
    if (onEtsy) params.set('onEtsy', onEtsy);
    if (hasDescription) params.set('hasDescription', hasDescription);
    if (noPrice) params.set('noPrice', 'true');
    if (noWeight) params.set('noWeight', 'true');
    if (pasShape) params.set('pasShape', pasShape);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);

    try {
      const res = await apiFetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [query, boxCode, weightMin, weightMax, priceMin, priceMax, sold, onShop, onEtsy, hasDescription, noPrice, noWeight, pasShape, sortBy, sortDir]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const resetFilters = () => {
    setQuery(''); setBoxCode(''); setWeightMin(''); setWeightMax('');
    setPriceMin(''); setPriceMax(''); setSold(''); setOnShop(''); setOnEtsy('');
    setHasDescription(''); setNoPrice(false); setNoWeight(false);
    setPasShape('');
    setSortBy('evidNumber'); setSortDir('asc');
    setResults(null);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Vyhledávání</h1>
      <p className="text-muted-foreground mb-6">Najděte kameny podle různých kritérií</p>

      {/* Search filters */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        {/* Main search */}
        <div className="mb-5">
          <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Hledat text</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Číslo kamene, popis, místo, kazety..."
              className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <svg className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
        </div>

        {/* Filter grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-5">
          {/* Box */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Kazety</label>
            <input
              type="text" value={boxCode} onChange={(e) => setBoxCode(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="K0001"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Weight range */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Hmotnost od (g)</label>
            <input
              type="number" step="0.1" value={weightMin} onChange={(e) => setWeightMin(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="0"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Hmotnost do (g)</label>
            <input
              type="number" step="0.1" value={weightMax} onChange={(e) => setWeightMax(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="100"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Price range */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Cena od (Kč)</label>
            <input
              type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="0"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Cena do (Kč)</label>
            <input
              type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="100000"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Eshop status */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Eshop</label>
            <select value={onShop} onChange={(e) => setOnShop(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
              <option value="">Vše</option>
              <option value="true">Na eshopu</option>
              <option value="false">Mimo eshop</option>
            </select>
          </div>
        </div>

        {/* Additional filters */}
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <select value={sold} onChange={(e) => setSold(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
            <option value="">Prodáno: Vše</option>
            <option value="true">Prodané</option>
            <option value="false">Neprodané</option>
          </select>

          <select value={onEtsy} onChange={(e) => setOnEtsy(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
            <option value="">Etsy: Vše</option>
            <option value="true">Na Etsy</option>
            <option value="false">Mimo Etsy</option>
          </select>

          <select value={hasDescription} onChange={(e) => setHasDescription(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
            <option value="">Popis: Vše</option>
            <option value="true">Má popis</option>
            <option value="false">Bez popisu</option>
          </select>

          <select value={pasShape} onChange={(e) => setPasShape(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
            <option value="">Tvar: Vše</option>
            <option value="NONE">— bez tvaru —</option>
            {PAS_SHAPES.map((s) => (
              <option key={s.key} value={s.key}>{s.cz}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={noWeight} onChange={(e) => setNoWeight(e.target.checked)}
              className="rounded border-border bg-muted text-primary focus:ring-ring" />
            Bez hmotnosti
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={noPrice} onChange={(e) => setNoPrice(e.target.checked)}
              className="rounded border-border bg-muted text-primary focus:ring-ring" />
            Bez ceny
          </label>

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground uppercase">Řadit</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
              <option value="evidNumber">Číslo</option>
              <option value="weight">Hmotnost</option>
              <option value="salePrice">Prodejní cena</option>
              <option value="purchasePrice">Nákupní cena</option>
              <option value="box">Kazety</option>
              <option value="createdAt">Datum přidání</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground hover:border-foreground/40 transition-colors">
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button onClick={handleSearch} disabled={searching}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {searching ? 'Hledám...' : 'Vyhledat'}
          </button>
          <button onClick={resetFilters}
            className="bg-muted border border-border hover:border-foreground/40 text-muted-foreground px-4 py-2.5 rounded-lg text-sm transition-colors">
            Resetovat filtry
          </button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Nalezeno <span className="text-primary">{results.total}</span> kamenů
            </h2>
            <div className="flex items-center gap-1 bg-muted border border-border rounded-lg p-0.5">
              <button onClick={() => setViewMode('grouped')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'grouped' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                Podle kazet
              </button>
              <button onClick={() => setViewMode('flat')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'flat' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                Seznam
              </button>
            </div>
          </div>

          {results.total === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <p className="text-muted-foreground text-lg">Žádné výsledky</p>
              <p className="text-muted-foreground text-sm mt-1">Zkuste upravit filtry</p>
            </div>
          ) : viewMode === 'grouped' ? (
            <GroupedView grouped={results.grouped} />
          ) : (
            <FlatView items={results.items} />
          )}
        </div>
      )}
    </div>
  );
}

function GroupedView({ grouped }: { grouped: Record<string, SearchItem[]> }) {
  const sortedBoxes = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {sortedBoxes.map((boxCode) => (
        <div key={boxCode} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-primary">{boxCode}</h3>
              <span className="text-xs bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary px-2 py-0.5 rounded-full">
                {grouped[boxCode].length} ks
              </span>
            </div>
            <Link href={`/boxes/${grouped[boxCode][0].box.id}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Otevřít kazetu →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 p-4">
            {grouped[boxCode].map((item) => (
              <StoneCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FlatView({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="text-left px-3 py-3 text-muted-foreground font-medium w-14">Foto</th>
            <th className="text-left px-3 py-3 text-muted-foreground font-medium">Kat. č.</th>
            <th className="text-left px-3 py-3 text-muted-foreground font-medium">Popis</th>
            <th className="text-left px-3 py-3 text-muted-foreground font-medium">Místo</th>
            <th className="text-right px-3 py-3 text-muted-foreground font-medium">Hmotnost</th>
            <th className="text-right px-3 py-3 text-muted-foreground font-medium">Prodejka</th>
            <th className="text-center px-3 py-3 text-muted-foreground font-medium">Eshop</th>
            <th className="text-center px-3 py-3 text-muted-foreground font-medium">Etsy</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => router.push(`/items/${item.id}`)}
              className="border-b border-border hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <td className="px-3 py-2">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getThumbnailUrl(item.photoPath, item.mainPhoto)} alt="" className="object-cover w-full h-full" />
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="text-foreground font-mono text-xs font-semibold tracking-tight">
                  {getCatalogNumber(item.box.code, item.evidNumber)}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{item.description || '-'}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.location || '-'}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatWeight(item.weight)}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatPrice(item.salePrice)}</td>
              <td className="px-3 py-2 text-center">
                {item.onShop ? <span className="w-2 h-2 inline-block rounded-full bg-primary" /> : <span className="w-2 h-2 inline-block rounded-full bg-muted" />}
              </td>
              <td className="px-3 py-2 text-center">
                {item.onEtsy ? <span className="w-2 h-2 inline-block rounded-full bg-warning" /> : <span className="w-2 h-2 inline-block rounded-full bg-muted" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StoneCard({ item }: { item: SearchItem }) {
  const catalogNumber = getCatalogNumber(item.box.code, item.evidNumber);

  return (
    <Link href={`/items/${item.id}`} className="group">
      <div className={`bg-muted border border-border rounded-lg overflow-hidden hover:border-primary/60 transition-all ${item.sold ? 'opacity-50' : ''}`}>
        <div className="aspect-square bg-white relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getThumbnailUrl(item.photoPath, item.mainPhoto)}
            alt={catalogNumber}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-1 right-1 flex gap-0.5">
            {item.sold && <span className="bg-[color-mix(in_srgb,var(--destructive)_60%,transparent)] text-destructive text-[9px] px-1.5 py-0.5 rounded font-medium">PROD</span>}
            {item.onShop && !item.sold && <span className="w-2 h-2 rounded-full bg-primary" />}
            {item.onEtsy && !item.sold && <span className="w-2 h-2 rounded-full bg-warning" />}
          </div>
        </div>
        <div className="p-2">
          <p className="text-xs font-mono text-primary group-hover:text-primary transition-colors truncate">
            {catalogNumber}
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-xs text-muted-foreground">{formatWeight(item.weight)}</span>
            {parseFloat(item.salePrice) > 0 && (
              <span className="text-xs text-foreground font-medium">{formatPrice(item.salePrice)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
