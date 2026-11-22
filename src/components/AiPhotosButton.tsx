'use client';

/**
 * AI úprava e-shopových fotek (Gideon 21. 11. 2026) — na kameni i na celé kazetě.
 * Běží na pozadí (POST /api/ai/photos), průběh dotazováním, na konci souhrn s fotkami ke kontrole
 * (AI mohla změnit obrys kamene → do e-shopu jde originál, dokud ji člověk neschválí na detailu kamene).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

interface SlotOutcome { slot: number; status: 'ok' | 'suspect' | 'failed' | 'skipped'; score?: number; error?: string }
interface JobItem { itemId: number; catalogNumber: string; status: 'ok' | 'skipped' | 'failed'; slots: SlotOutcome[]; error?: string }
interface PhotoJob {
  id: string; label: string; overwrite: boolean;
  total: number; done: number; photosOk: number; photosSuspect: number; failed: number;
  running: boolean; cancelled: boolean; error?: string;
  current: { catalogNumber: string; note: string } | null;
  results: JobItem[];
}

type Props =
  | { scope: 'item'; itemId: number; label: string; missingCount: number; photoCount: number }
  | { scope: 'box'; boxId: number; label: string; missingCount: number; photoCount: number }
  | { scope: 'all'; label: string; missingCount: number; photoCount: number };

const POLL_MS = 3000;
/** gemini-3-pro-image, výstup 2K, režim Flex — ceník ai.google.dev/gemini-api/docs/pricing k 21. 11. 2026 */
const USD_PER_PHOTO = 0.067;
const SEC_PER_PHOTO = 10; // 4 fotky kamene souběžně, Flex ~25–60 s na fotku

const fmtUsd = (n: number) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AiPhotosButton(props: Props) {
  const router = useRouter();
  const [job, setJob] = useState<PhotoJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/ai/photos')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.job?.running && d.job.label === props.label) setJob(d.job); })
      .catch(() => {});
    return () => { alive = false; };
  }, [props.label]);

  useEffect(() => {
    if (!job?.running) return;
    const id = job.id;
    const t = setInterval(async () => {
      try {
        const r = await apiFetch(`/api/ai/photos/${id}`);
        if (!r.ok) { clearInterval(t); setError('Průběh nelze načíst (restart serveru?)'); setJob((j) => (j ? { ...j, running: false } : j)); return; }
        const d = await r.json();
        setJob(d.job);
        if (!d.job.running) { clearInterval(t); setShowSummary(true); router.refresh(); }
      } catch { /* další tick */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [job?.id, job?.running, router]);

  async function start(overwrite: boolean) {
    const photos = overwrite ? props.photoCount : props.missingCount;
    const cost = `${fmtUsd(photos * USD_PER_PHOTO)} USD`;
    const mins = Math.max(1, Math.ceil((photos * SEC_PER_PHOTO) / 60));
    const what = props.scope === 'item' ? `kamene ${props.label}` : props.scope === 'box' ? `kazety ${props.label}` : 'všech neprodaných kamenů skladu';
    const msg = overwrite
      ? `Znovu AI upravit VŠECH ${photos} e-shopových fotek ${what}? Dosavadní AI verze se nahradí.\n\nCena cca ${cost}, ${mins} min. Originály zůstávají beze změny.`
      : `AI upravit ${photos} e-shopových fotek ${what} (vyčistit, bílé pozadí, sjednotit)?\n\nCena cca ${cost}, ${mins} min, běží na pozadí. Originály zůstávají beze změny.`;
    if (!confirm(msg)) return;
    setStarting(true); setError('');
    try {
      const res = await apiFetch('/api/ai/photos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(props.scope === 'item' ? { itemId: props.itemId, overwrite } : props.scope === 'box' ? { boxId: props.boxId, overwrite } : { all: true, overwrite }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.jobId) { setError(d?.error || (d?.total === 0 ? 'Není co upravovat' : 'Nelze spustit')); return; }
      setJob({ id: d.jobId, label: props.label, overwrite, total: d.total, done: 0, photosOk: 0, photosSuspect: 0, failed: 0, running: true, cancelled: false, current: null, results: [] });
    } catch {
      setError('Chyba připojení');
    } finally {
      setStarting(false);
    }
  }

  const running = !!job?.running;
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const review = job?.results.filter((r) => r.status === 'failed' || r.slots.some((s) => s.status === 'suspect' || s.status === 'failed')) ?? [];
  const nothingMissing = props.missingCount === 0;

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => start(nothingMissing && props.scope !== 'all')}
          disabled={running || starting || props.photoCount === 0}
          title={props.photoCount === 0 ? 'Bez fotek' : 'AI vyčistí a sjednotí fotky, které jdou do e-shopu (max 4 na kámen). Originály se nemění.'}
          style={{ color: 'var(--violet)', borderColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }}
          className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--violet)_10%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          {running
            ? `AI fotky · ${job!.done} / ${job!.total}`
            : starting ? 'Spouštím…'
            : nothingMissing ? 'AI fotky · znovu'
            : props.scope === 'item' ? `AI vylepšit fotky · ${props.missingCount}`
            : props.scope === 'all' ? `AI fotky celý sklad · chybí ${props.missingCount}` : `AI fotky · chybí ${props.missingCount}`}
        </button>
        {!running && props.scope !== 'all' && !nothingMissing && props.photoCount > props.missingCount && (
          <button type="button" onClick={() => start(true)} disabled={starting}
            title="Upraví znovu všechny e-shopové fotky a nahradí dosavadní AI verze"
            className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            znovu vše
          </button>
        )}
      </span>
      {error && <span className="text-xs text-destructive ml-2">{error}</span>}

      {running && job && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-card border-b border-border px-4 py-2 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--violet)' }}>
              AI fotky · {job.label} · {job.done} / {job.total}
            </span>
            <div className="w-56 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: 'var(--violet)' }} />
            </div>
            <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
              {job.photosOk} fotek hotovo{job.photosSuspect ? ` · ${job.photosSuspect} ke kontrole` : ''}{job.failed ? ` · ${job.failed} kamenů selhalo` : ''}
            </span>
            {job.current && (
              <span className="text-[11px] font-mono text-text-2 truncate" title={job.current.note}>· {job.current.catalogNumber}: {job.current.note}</span>
            )}
          </div>
          <button type="button" onClick={() => apiFetch(`/api/ai/photos/${job.id}`, { method: 'DELETE' }).catch(() => {})}
            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
            {job.cancelled ? 'Ruším po aktuálním kameni…' : 'Zastavit'}
          </button>
        </div>
      )}

      {showSummary && job && !job.running && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">AI fotky · {job.label}{job.cancelled ? ' · zrušeno' : ''}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {job.photosOk} fotek upraveno a jde do e-shopu
              {job.photosSuspect ? ` · ${job.photosSuspect} ke kontrole` : ''}
              {job.failed ? ` · ${job.failed} kamenů selhalo` : ''}
            </p>
            {job.error && <p className="text-sm text-destructive mb-3">{job.error}</p>}
            {review.length > 0 ? (
              <>
                <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1.5">Zkontrolovat</p>
                <p className="text-xs text-muted-foreground mb-2">
                  „Ke kontrole“ = obrys kamene na AI fotce se liší od originálu (AI mohla kámen pozměnit). Do e-shopu zatím jde originál.{' '}
                  <Link href="/admin/ai-fotky" className="text-foreground underline underline-offset-2">Zkontrolovat všechny na jedné stránce →</Link>
                </p>
                <ul className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                  {review.map((r) => (
                    <li key={r.itemId} className="px-3 py-1.5 text-sm flex items-center justify-between gap-3">
                      <Link href={`/items/${r.itemId}#media`} className="font-mono text-foreground hover:underline">{r.catalogNumber}</Link>
                      <span className="text-xs text-right" style={{ color: r.status === 'failed' ? 'var(--destructive)' : 'var(--warning)' }}>
                        {r.slots.filter((s) => s.status === 'suspect').map((s) => `foto ${s.slot} ke kontrole`).join(', ')}
                        {r.error ? ` ${r.error}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--success)' }}>✓ Nic ke kontrole.</p>
            )}
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setShowSummary(false)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40">
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
