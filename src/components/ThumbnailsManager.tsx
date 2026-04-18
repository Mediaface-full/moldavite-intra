'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface ThumbStats {
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

interface WebStats {
  originalsCount: number;
  originalsSizeMB: number;
  webCount: number;
  webSizeMB: number;
  savedMB: number;
  sharpAvailable: boolean;
  webPath: string;
  maxWidth: number;
  quality: number;
  created?: number;
  skipped?: number;
  failed?: number;
  remaining?: number;
  done?: boolean;
  totalOriginals?: number;
  errors?: string[];
}

export default function ThumbnailsManager() {
  const [thumbs, setThumbs] = useState<ThumbStats | null>(null);
  const [web, setWeb] = useState<WebStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function loadAll() {
    setError('');
    try {
      const [t, w] = await Promise.all([
        apiFetch('/api/admin/thumbnails').then((r) => r.json()),
        apiFetch('/api/admin/web-resize').then((r) => r.json()),
      ]);
      setThumbs(t);
      setWeb(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function action(url: string, method: string, body?: unknown, key?: string) {
    if (busy) return;
    if (!confirm('Operace může trvat několik minut. Pokračovat?')) return;
    setBusy(key || url);
    setError('');
    try {
      const res = await apiFetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (url.includes('thumbnails')) setThumbs(data);
      if (url.includes('web-resize')) setWeb(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // Web-resize can process hundreds of photos which is well over the 60 s
  // reverse proxy timeout. Call the endpoint in a loop until remaining=0.
  // Each batch re-walks the tree from scratch, so `skipped` already counts
  // everything done in previous batches + this one — using the last response
  // as-is is the correct running total (don't accumulate across batches).
  async function webResizeLoop(force: boolean) {
    if (busy) return;
    if (!confirm('Spustí se generování webových verzí. Může to trvat několik minut, nezavírej stránku.')) return;
    setBusy(force ? 'web-resize-force' : 'web-resize');
    setError('');
    try {
      while (true) {
        const res = await apiFetch('/api/admin/web-resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) {
          const text = await res.text();
          try {
            const j = JSON.parse(text);
            throw new Error(j.error || `HTTP ${res.status}`);
          } catch {
            throw new Error(
              `HTTP ${res.status} — pravděpodobně proxy timeout. Server jede dál, klikni "Aktualizovat statistiky" za chvíli.`
            );
          }
        }
        const data: WebStats = await res.json();
        setWeb(data);
        // force only needs to run on the first pass; afterwards mtime guards
        // handle idempotency.
        force = false;
        if (data.done || !data.remaining) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Správa obrázků</h1>
        <p className="text-sm text-text-muted">
          Tato stránka řídí dvě vrstvy optimalizace fotek: malé náhledy pro seznam a
          zmenšené webové varianty originálů pro e-shop a rychlejší prohlížení.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
          Chyba: {error}
        </div>
      )}

      {/* ------------------- WEB VARIANTS ------------------- */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Webové verze fotek (místo originálů)</h2>
        <p className="text-sm text-text-muted mb-4">
          Vytvoří zmenšené JPEG kopie všech fotek v samostatné složce{' '}
          <code>FOTO_MOLDAVITE_web/</code>. Po ověření, že vše funguje, můžeš smazat
          originály v <code>FOTO_MOLDAVITE/</code> a ušetřit 80–90 % místa.
          Aplikace automaticky použije menší variantu, pokud existuje.
        </p>

        {web ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Originály (ks)" value={web.originalsCount} />
              <StatCard label="Originály (MB)" value={`${web.originalsSizeMB} MB`} />
              <StatCard label="Web varianty (ks)" value={web.webCount} />
              <StatCard label="Web varianty (MB)" value={`${web.webSizeMB} MB`} />
            </div>
            {web.savedMB > 0 && (
              <div className="p-3 mb-4 rounded-lg bg-green-900/20 border border-green-800 text-green-300 text-sm">
                Ušetřeno: <strong>{web.savedMB} MB</strong> ({Math.round((web.savedMB / Math.max(web.originalsSizeMB, 1)) * 100)} %).
                Teď můžeš smazat složku <code>kameny/FOTO_MOLDAVITE/</code> — appka jede z web variant.
              </div>
            )}
            {!web.sharpAvailable && (
              <div className="p-3 mb-4 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-300 text-sm">
                ⚠️ Sharp modul není dostupný — zmenšování nepůjde.
              </div>
            )}
            <div className="text-xs text-text-muted mb-4">
              Parametry: max {web.maxWidth} px, JPEG quality {web.quality}. Cesta: <code>{web.webPath}</code>
            </div>
            {busy?.startsWith('web-resize') && web.totalOriginals && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>
                    {web.created || 0} / {web.totalOriginals} hotovo
                    {web.remaining !== undefined && web.remaining > 0 ? ` (${web.remaining} zbývá)` : ''}
                  </span>
                  <span>
                    {Math.round((((web.created || 0) + (web.skipped || 0)) / Math.max(web.totalOriginals, 1)) * 100)} %
                  </span>
                </div>
                <div className="h-2 bg-bg-secondary rounded overflow-hidden">
                  <div
                    className="h-full bg-moldavite-500 transition-all"
                    style={{
                      width: `${Math.round((((web.created || 0) + (web.skipped || 0)) / Math.max(web.totalOriginals, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => webResizeLoop(false)}
                disabled={busy !== null || !web.sharpAvailable}
                className="bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                {busy === 'web-resize' ? 'Zpracovávám…' : 'Vytvořit / aktualizovat webové verze'}
              </button>
              <button
                onClick={() => webResizeLoop(true)}
                disabled={busy !== null || !web.sharpAvailable}
                className="border border-border-color text-text-secondary hover:border-border-hover disabled:opacity-40 px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                {busy === 'web-resize-force' ? 'Zpracovávám…' : 'Přegenerovat vše (force)'}
              </button>
              <button
                onClick={loadAll}
                disabled={busy !== null}
                className="border border-border-color text-text-secondary hover:border-border-hover disabled:opacity-40 px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                Aktualizovat statistiky
              </button>
            </div>
            {(web.created !== undefined || web.skipped !== undefined) && (
              <div className="mt-4 p-4 rounded-lg bg-bg-secondary border border-border-color text-sm">
                <h3 className="font-semibold mb-2">Poslední operace</h3>
                <ul className="space-y-1 text-text-secondary">
                  {web.created !== undefined && <li>Vytvořeno: {web.created}</li>}
                  {web.skipped !== undefined && <li>Přeskočeno (aktuální): {web.skipped}</li>}
                  {web.failed !== undefined && <li>Selhalo: {web.failed}</li>}
                </ul>
                {web.errors && web.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-400">Chyby: {web.errors.length}</summary>
                    <ul className="mt-2 text-xs text-red-400/80 font-mono space-y-1">
                      {web.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-text-muted text-sm">Načítám…</p>
        )}
      </section>

      {/* ------------------- THUMBNAILS ------------------- */}
      <section className="border-t border-border-color pt-8">
        <h2 className="text-xl font-semibold mb-3">Náhledy (pro seznam kamenů)</h2>
        <p className="text-sm text-text-muted mb-4">
          Malé WebP thumbnaily (192 + 384 px) pro rychlé načítání seznamu kamenů.
          Generují se on-demand při prvním zobrazení, tlačítko je pregeneruje dopředu.
        </p>

        {thumbs ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Kamenů" value={thumbs.totalItems} />
              <StatCard label="S fotkami" value={thumbs.itemsWithPhotos} />
              <StatCard label="V cache" value={thumbs.cacheCount} />
              <StatCard label="Velikost" value={`${thumbs.cacheSizeMB} MB`} />
            </div>
            {!thumbs.sharpAvailable && (
              <div className="p-3 mb-4 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-300 text-sm">
                ⚠️ Sharp modul není dostupný — thumbnaily nepůjdou.
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => action('/api/admin/thumbnails', 'POST', undefined, 'thumbs-warm')}
                disabled={busy !== null || !thumbs.sharpAvailable}
                className="bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                {busy === 'thumbs-warm' ? 'Generuji…' : 'Vygenerovat náhledy'}
              </button>
              <button
                onClick={() => action('/api/admin/thumbnails', 'DELETE', undefined, 'thumbs-clear')}
                disabled={busy !== null || thumbs.cacheCount === 0}
                className="border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-40 px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                {busy === 'thumbs-clear' ? 'Mažu…' : 'Smazat cache'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-text-muted text-sm">Načítám…</p>
        )}
      </section>
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
