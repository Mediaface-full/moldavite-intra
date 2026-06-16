'use client';

/**
 * Tlačítko Smazat s dvojím schválením.
 *
 * 1. Klik → otevře modal "Opravdu smazat? Co se stane:..."
 * 2. Uživatel musí přepsat název entity (typed confirmation) — chrání před
 *    autofill nebo náhodným klikem
 * 3. Klik na "Definitivně smazat" → onConfirm()
 *
 * Záměrně NEpoužívá nativní confirm() — modal s typed confirmation je
 * jasnější UI a nejde to "buchnout enter" omylem.
 */
import { useState } from 'react';

type Props = {
  /** Co se má napsat pro odemknutí smazání. Obvykle code/název entity. */
  confirmPhrase: string;
  /** Label tlačítka (default: "Smazat"). */
  label?: string;
  /** Krátký popis CO se smaže (zobrazí se v modálu). */
  what: string;
  /** Důsledek smazání (zobrazí se v modálu jako varování). */
  consequence?: string;
  /** Async smazání. Throwni chybu pokud selhalo. */
  onConfirm: () => Promise<void>;
  /** Pokud true, tlačítko zobrazí spinner a je disabled. */
  loading?: boolean;
  /** Pokud nastaveno, tlačítko je disabled s tooltipem. */
  disabledReason?: string | null;
  variant?: 'icon' | 'button';
};

export default function DoubleConfirmDelete({
  confirmPhrase,
  label = 'Smazat',
  what,
  consequence,
  onConfirm,
  loading,
  disabledReason,
  variant = 'button',
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const phraseMatches = typed.trim() === confirmPhrase;

  async function handleConfirm() {
    if (!phraseMatches || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      setOpen(false);
      setTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const buttonStyle = {
    color: 'var(--destructive)',
    borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
  };
  const isDisabled = !!disabledReason || loading;

  return (
    <>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen(true)}
        disabled={isDisabled}
        title={disabledReason ?? ''}
        style={isDisabled ? undefined : buttonStyle}
        className={`${
          variant === 'icon'
            ? 'inline-flex items-center justify-center w-8 h-8 rounded-md'
            : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider'
        } bg-transparent border ${isDisabled ? 'border-border text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]'} transition-colors`}
      >
        {variant === 'icon' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            {label}
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div
            className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl"
            style={{ borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--destructive) 15%, transparent)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: 'var(--destructive)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </span>
              <h3 className="text-lg font-semibold">Smazat {what}?</h3>
            </div>

            {consequence && (
              <p className="text-sm text-muted-foreground mb-4">{consequence}</p>
            )}

            <div
              className="rounded-lg p-3 mb-4 border"
              style={{
                background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
              }}
            >
              <p className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--destructive)' }}>
                ⚠ Tato akce je nevratná.
              </p>
              <p className="text-xs text-muted-foreground">
                Pro potvrzení napiš přesně: <code className="font-mono font-semibold text-foreground">{confirmPhrase}</code>
              </p>
            </div>

            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow mb-4"
            />

            {error && (
              <p
                className="text-sm rounded-lg px-3 py-2 mb-4 border"
                style={{
                  color: 'var(--destructive)',
                  background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
                }}
              >
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setTyped(''); setError(''); }}
                disabled={submitting}
                className="flex-1 bg-muted hover:bg-muted/70 disabled:opacity-50 text-foreground border border-border px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!phraseMatches || submitting}
                style={
                  phraseMatches && !submitting
                    ? { background: 'var(--destructive)', color: 'var(--destructive-foreground, #fff)' }
                    : undefined
                }
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  phraseMatches && !submitting
                    ? 'hover:opacity-90'
                    : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Mažu…' : 'Definitivně smazat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
