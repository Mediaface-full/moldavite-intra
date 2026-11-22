'use client';

/**
 * Kontrola AI fotek — originál vlevo, AI verze vpravo, rychlé odklikávání.
 * Klávesy: A = schválit (do e-shopu jde AI verze), Z = zahodit (zůstane originál), mezerník = přeskočit.
 * Rozhodnutí jde na existující POST /api/items/[id]/ai-photos; karta po kliknutí hned zmizí,
 * při chybě se vrátí s hláškou.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import { fmtInt } from '@/lib/utils';

export interface ReviewEntry {
  itemId: number;
  catalogNumber: string;
  slot: number;
  score: number;
  originalSrc: string;
  aiSrc: string;
}

const key = (e: ReviewEntry) => `${e.itemId}:${e.slot}`;

export default function AiPhotoReview({ entries: initial }: { entries: ReviewEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [active, setActive] = useState(0);
  const [done, setDone] = useState({ approved: 0, rejected: 0 });
  const [error, setError] = useState('');
  const refs = useRef(new Map<string, HTMLDivElement>());

  const decide = useCallback(async (entry: ReviewEntry, action: 'approve' | 'reject') => {
    setError('');
    setEntries((list) => list.filter((e) => key(e) !== key(entry)));
    setDone((d) => (action === 'approve' ? { ...d, approved: d.approved + 1 } : { ...d, rejected: d.rejected + 1 }));
    try {
      const res = await apiFetch(`/api/items/${entry.itemId}/ai-photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: entry.slot, action }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
    } catch (err) {
      setEntries((list) => [entry, ...list]);
      setDone((d) => (action === 'approve' ? { ...d, approved: d.approved - 1 } : { ...d, rejected: d.rejected - 1 }));
      setError(`${entry.catalogNumber} foto ${entry.slot}: nepodařilo se uložit (${err instanceof Error ? err.message : err}) — vráceno nahoru`);
      setActive(0);
    }
  }, []);

  // Aktivní karta zůstává na stejném indexu (další se posune na její místo)
  const current = entries[Math.min(active, entries.length - 1)];

  useEffect(() => {
    if (!current) return;
    refs.current.get(key(current))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!current) return;
      const k = ev.key.toLowerCase();
      if (k === 'a') { ev.preventDefault(); decide(current, 'approve'); }
      else if (k === 'z') { ev.preventDefault(); decide(current, 'reject'); }
      else if (k === ' ' || k === 'arrowdown') { ev.preventDefault(); setActive((i) => Math.min(i + 1, entries.length - 1)); }
      else if (k === 'arrowup') { ev.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, decide, entries.length]);

  return (
    <div>
      <div className="mb-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">Bohemian Moldavite · Intra</p>
        <h1 className="text-3xl font-bold tracking-tight">Kontrola AI fotek</h1>
        <p className="text-sm text-muted-foreground mt-1">
          U těchto fotek se obrys kamene na AI verzi liší od originálu — AI mohla kámen pozměnit. Do e-shopu zatím jde originál.
        </p>
      </div>

      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-4 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-mono">
          <span className="text-foreground font-semibold">{fmtInt(entries.length)}</span> <span className="text-muted-foreground">zbývá</span>
          <span className="text-muted-foreground"> · </span>
          <span style={{ color: 'var(--success)' }}>{fmtInt(done.approved)} schváleno</span>
          <span className="text-muted-foreground"> · </span>
          <span className="text-text-2">{fmtInt(done.rejected)} zahozeno</span>
        </p>
        <p className="text-[11px] font-mono text-text-2 uppercase tracking-wider">
          <Kbd>A</Kbd> schválit · <Kbd>Z</Kbd> zahodit (originál) · <Kbd>mezera</Kbd> přeskočit · <Kbd>↑</Kbd>
        </p>
      </div>
      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {entries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-base" style={{ color: 'var(--success)' }}>✓ Nic ke kontrole.</p>
          <p className="text-sm text-muted-foreground mt-1">Všechny AI fotky pro e-shop jsou buď v pořádku, nebo rozhodnuté.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e, i) => {
            const isActive = current && key(current) === key(e);
            return (
              <div key={key(e)} ref={(el) => { if (el) refs.current.set(key(e), el); else refs.current.delete(key(e)); }}
                onClick={() => setActive(i)}
                className={`bg-card border-2 rounded-xl p-3 transition-colors ${isActive ? 'border-primary shadow-md' : 'border-border'}`}>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <p className="font-mono text-sm">
                    <Link href={`/items/${e.itemId}#media`} className="text-foreground font-semibold hover:underline" target="_blank">{e.catalogNumber}</Link>
                    <span className="text-muted-foreground"> · foto {e.slot} · shoda obrysu </span>
                    <span style={{ color: 'var(--warning)' }}>{Math.round(e.score * 100)} %</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); decide(e, 'reject'); }}
                      className="bg-card border border-border hover:border-foreground/40 text-text-2 hover:text-foreground px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider">
                      Zahodit · Z
                    </button>
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); decide(e, 'approve'); }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider">
                      Schválit AI · A
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-3xl">
                  <Photo label="Originál" src={e.originalSrc} lazy={i > 4} />
                  <Photo label="AI verze" src={e.aiSrc} lazy={i > 4} ai />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Photo({ label, src, lazy, ai }: { label: string; src: string; lazy: boolean; ai?: boolean }) {
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
      className="relative block aspect-square bg-white rounded-lg overflow-hidden border border-border" title="Otevřít v plné velikosti">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${src}?w=512`} alt={label} loading={lazy ? 'lazy' : 'eager'} className="absolute inset-0 w-full h-full object-contain" />
      <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded font-mono text-white uppercase tracking-wider"
        style={{ background: ai ? 'var(--violet)' : 'rgba(0,0,0,.6)' }}>{label}</span>
    </a>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-block min-w-5 px-1 py-px rounded border border-border bg-card text-foreground text-[10px] text-center">{children}</kbd>;
}
