'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalItems: number;
  itemsWithPhotos: number;
  cacheCount: number;
  cacheSizeMB: number;
  sharpAvailable: boolean;
  cachePath: string;
  generated?: number;
  skipped?: number;
  missing?: number;
  errors?: string[];
  removed?: number;
}

export default function ThumbnailsManager() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | 'warm' | 'clear'>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/thumbnails', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function warm() {
    if (busy) return;
    setBusy('warm');
    setError('');
    try {
      const res = await fetch('/api/admin/thumbnails', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function clearCache() {
    if (busy) return;
    if (!confirm('Opravdu smazat celou cache náhledů? Načtou se znovu při prvním zobrazení.')) return;
    setBusy('clear');
    setError('');
    try {
      const res = await fetch('/api/admin/thumbnails', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Náhledy (thumbnaily)</h1>

      {loading && !stats && <p className="text-text-muted">Načítám stav…</p>}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
          Chyba: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard label="Kamenů celkem" value={stats.totalItems} />
            <StatCard label="S fotkami" value={stats.itemsWithPhotos} />
            <StatCard label="Náhledů v cache" value={stats.cacheCount} />
            <StatCard label="Velikost cache" value={`${stats.cacheSizeMB} MB`} />
          </div>

          <div
            className={`mb-6 p-3 rounded-lg border text-sm ${
              stats.sharpAvailable
                ? 'bg-green-900/20 border-green-800 text-green-300'
                : 'bg-yellow-900/20 border-yellow-800 text-yellow-300'
            }`}
          >
            <div className="flex items-start gap-2">
              <span>{stats.sharpAvailable ? '✓' : '⚠'}</span>
              <div>
                <div className="font-semibold mb-1">
                  {stats.sharpAvailable
                    ? 'Obrázkový procesor (sharp) funguje'
                    : 'Obrázkový procesor (sharp) NENÍ dostupný'}
                </div>
                {!stats.sharpAvailable && (
                  <div>
                    Server nedokáže načíst modul <code>sharp</code>, proto se thumbnaily
                    negenerují a místo nich se servíruje plný obrázek. Zkontroluj Dockerfile,
                    že kopíruje <code>node_modules/sharp</code> a <code>node_modules/@img</code>.
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs opacity-60 mt-2">
              Cesta k cache: <code>{stats.cachePath}</code>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={warm}
              disabled={busy !== null || !stats.sharpAvailable}
              className="bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {busy === 'warm' ? 'Generuji…' : 'Vygenerovat náhledy pro všechny kameny'}
            </button>
            <button
              onClick={clearCache}
              disabled={busy !== null || stats.cacheCount === 0}
              className="border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-40 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {busy === 'clear' ? 'Mažu…' : 'Vymazat cache'}
            </button>
            <button
              onClick={load}
              disabled={busy !== null}
              className="border border-border-color text-text-secondary hover:border-border-hover px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Aktualizovat
            </button>
          </div>

          {(stats.generated !== undefined ||
            stats.skipped !== undefined ||
            stats.missing !== undefined ||
            stats.removed !== undefined) && (
            <div className="mt-6 p-4 rounded-lg bg-bg-secondary border border-border-color text-sm">
              <h2 className="font-semibold mb-2">Poslední operace</h2>
              <ul className="space-y-1 text-text-secondary">
                {stats.generated !== undefined && <li>Vygenerováno: {stats.generated}</li>}
                {stats.skipped !== undefined && <li>Přeskočeno (už v cache): {stats.skipped}</li>}
                {stats.missing !== undefined && <li>Chybějící zdrojová fota: {stats.missing}</li>}
                {stats.removed !== undefined && <li>Smazáno: {stats.removed}</li>}
              </ul>
              {stats.errors && stats.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-red-400">
                    Chyby: {stats.errors.length}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-red-400/80">
                    {stats.errors.map((e, i) => (
                      <li key={i} className="font-mono">
                        {e}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-4 rounded-lg bg-bg-secondary border border-border-color">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
