'use client';

/**
 * Hromadné AI generování textů kamenů kazety — na pozadí (POST /api/ai/bulk), průběh
 * dotazováním každé 2,5 s, na konci souhrn s kameny k překontrolování.
 * Gideon 13. 10. 2026: dřív „bulk" = modal kámen po kameni s ručním schvalováním.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

interface BulkItemResult {
  itemId: number;
  catalogNumber: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
  savedFields?: string[];
  maxOverlapWords?: number;
  overlapWarning?: boolean;
}

interface BulkJob {
  id: string;
  boxCode: string;
  overwrite: boolean;
  total: number;
  done: number;
  ok: number;
  skipped: number;
  failed: number;
  warnings: number;
  running: boolean;
  cancelled: boolean;
  error?: string;
  results: BulkItemResult[];
  current?: { catalogNumber: string; note: string; since: string } | null;
}

interface Props {
  boxId: number;
  boxCode: string;
  /** kameny, kterým chybí aspoň jeden ze 6 textů */
  missingCount: number;
  totalCount: number;
}

const POLL_MS = 2500;

export default function AiBulkButton({ boxId, boxCode, missingCount, totalCount }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<BulkJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  // Po reloadu stránky navázat na běžící job (stav drží server).
  useEffect(() => {
    let alive = true;
    apiFetch('/api/ai/bulk')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.job?.running && d.job.boxCode === boxCode) setJob(d.job); })
      .catch(() => {});
    return () => { alive = false; };
  }, [boxCode]);

  // Dotazování průběhu.
  useEffect(() => {
    if (!job?.running) return;
    const id = job.id;
    const t = setInterval(async () => {
      try {
        const r = await apiFetch(`/api/ai/bulk/${id}`);
        if (!r.ok) { clearInterval(t); setError('Průběh nelze načíst (restart serveru?)'); setJob((j) => (j ? { ...j, running: false } : j)); return; }
        const d = await r.json();
        setJob(d.job);
        if (!d.job.running) {
          clearInterval(t);
          setShowSummary(true);
          router.refresh();
        }
      } catch { /* další tick */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [job?.id, job?.running, router]);

  async function start(overwrite: boolean) {
    const n = overwrite ? totalCount : missingCount;
    const msg = overwrite
      ? `Přegenerovat AI texty u VŠECH ${n} kamenů kazety ${boxCode} a PŘEPSAT existující názvy i popisy? Zhruba ${Math.ceil(n * 12 / 60)} min.`
      : `Vygenerovat AI texty pro ${n} kamenů kazety ${boxCode}, kterým texty chybí? Plní se jen prázdná pole. Zhruba ${Math.ceil(n * 12 / 60)} min, běží na pozadí.`;
    if (!confirm(msg)) return;
    setStarting(true);
    setError('');
    try {
      const res = await apiFetch('/api/ai/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxId, overwrite }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.jobId) { setError(d?.error || (d?.total === 0 ? 'Není co generovat' : 'Nelze spustit')); return; }
      setJob({ id: d.jobId, boxCode, overwrite, total: d.total, done: 0, ok: 0, skipped: 0, failed: 0, warnings: 0, running: true, cancelled: false, results: [] });
    } catch {
      setError('Chyba připojení');
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    await apiFetch(`/api/ai/bulk/${job.id}`, { method: 'DELETE' }).catch(() => {});
  }

  const running = !!job?.running;
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const toReview = job?.results.filter((r) => r.status === 'failed' || r.overlapWarning) ?? [];

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => start(false)}
          disabled={running || starting || missingCount === 0}
          title={missingCount === 0 ? 'Všechny kameny v kazetě mají texty' : 'Vygeneruje texty jen kamenům, kterým chybí; existující texty se nepřepisují'}
          style={{ color: 'var(--violet)', borderColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }}
          className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--violet)_10%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          {running ? `AI · ${job!.done} / ${job!.total}` : starting ? 'Spouštím…' : `AI texty · chybí u ${missingCount}`}
        </button>
        {!running && totalCount > 0 && (
          <button
            type="button"
            onClick={() => start(true)}
            disabled={starting}
            title="Přegeneruje texty u všech kamenů kazety a přepíše existující"
            className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            přepsat vše
          </button>
        )}
      </span>
      {error && <span className="text-xs text-destructive ml-2">{error}</span>}

      {running && job && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-card border-b border-border px-4 py-2 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--violet)' }}>
              AI texty · {job.boxCode} · {job.done} / {job.total}
            </span>
            <div className="w-56 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: 'var(--violet)' }} />
            </div>
            <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
              {job.ok} uloženo · {job.skipped} přeskočeno · {job.failed} selhalo{job.warnings ? ` · ${job.warnings} k překontrolování` : ''}
            </span>
            {job.current && (
              <span className="text-[11px] font-mono text-text-2 truncate" title={job.current.note}>
                · {job.current.catalogNumber}: {job.current.note}
              </span>
            )}
          </div>
          <button type="button" onClick={cancel} className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
            {job.cancelled ? 'Ruším po aktuálním kameni…' : 'Zastavit'}
          </button>
        </div>
      )}

      {showSummary && job && !job.running && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">AI texty · kazeta {job.boxCode}{job.cancelled ? ' · zrušeno' : ''}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {job.ok} uloženo · {job.skipped} přeskočeno (texty už byly) · {job.failed} selhalo
              {job.warnings ? ` · ${job.warnings} k překontrolování` : ''}
            </p>
            {job.error && <p className="text-sm text-destructive mb-3">{job.error}</p>}
            {toReview.length > 0 ? (
              <>
                <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1.5">Zkontrolovat</p>
                <ul className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                  {toReview.map((r) => (
                    <li key={r.itemId} className="px-3 py-1.5 text-sm flex items-center justify-between gap-3">
                      <Link href={`/items/${r.itemId}`} className="font-mono text-foreground hover:underline">{r.catalogNumber}</Link>
                      <span className="text-xs text-right" style={{ color: r.status === 'failed' ? 'var(--destructive)' : 'var(--warning)' }}>
                        {r.status === 'failed' ? `selhalo: ${r.error ?? ''}` : `shoda ${r.maxOverlapWords} slov s literaturou — přeformulovat`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--success)' }}>✓ Nic k překontrolování.</p>
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
