'use client';

/**
 * Tlačítko "Doplnit do N kamenů" v BoxDetail header.
 * Otevře modal, kde uživatel zadá cílový počet. Po potvrzení API vytvoří
 * prázdné Items s auto evidNumber + složky na disku pro FTP upload fotek.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

export default function GenerateItemsButton({
  boxId,
  currentCount,
  declaredPieces,
}: {
  boxId: number;
  currentCount: number;
  declaredPieces: number | null;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [count, setCount] = useState<string>(String(declaredPieces ?? Math.max(currentCount, 10)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; folders: number } | null>(null);

  async function handleSubmit() {
    const n = parseInt(count, 10);
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      setError('Zadej celé číslo 1–999');
      return;
    }
    if (n <= currentCount) {
      setError(`Kazeta už má ${currentCount} kamenů. Pro snížení odeber kameny ručně.`);
      return;
    }
    setBusy(true);
    setError('');
    const res = await apiFetch(`/api/boxes/${boxId}/generate-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: n }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || `HTTP ${res.status}`);
      return;
    }
    setResult({ created: data.created, folders: data.foldersCreated });
    setTimeout(() => {
      setShow(false);
      setResult(null);
      router.refresh();
    }, 2500);
  }

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-2"
        title="Doplnit prázdné kameny s evidenčními čísly + složky pro FTP fotky"
      >
        <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
        Doplnit kameny
      </button>

      {show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                <Icon name="plus" className="w-5 h-5" />
                Doplnit kameny do kazety
              </h3>
              <button onClick={() => { setShow(false); setResult(null); setError(''); }} className="text-muted-foreground hover:text-foreground" title="Zavřít">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            {result ? (
              <div className="text-sm">
                <p className="text-success font-semibold mb-2">✓ Vytvořeno {result.created} prázdných kamenů.</p>
                <p className="text-xs text-muted-foreground">
                  Plus {result.folders} složek na disku pro FTP upload fotek.
                  Modal se za chvilku zavře…
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Aktuálně <strong>{currentCount}</strong> kamenů v kazetě.
                  Zadej cílový počet — systém vytvoří prázdné kameny s auto evidenčními čísly
                  (např. 0001, 0002, …) a vytvoří odpovídající složky na disku pro nahrávání fotek přes FTP.
                </p>
                <div className="mb-4">
                  <label className="block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
                    Cílový počet kamenů v kazetě
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    autoFocus
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-base font-mono text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
                    Doplní {Math.max(0, (parseInt(count, 10) || 0) - currentCount)} nových kamenů.
                  </p>
                </div>
                {error && (
                  <p className="text-destructive text-xs bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] rounded-lg px-3 py-2 mb-4">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    disabled={busy}
                    className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    {busy ? 'Vytvářím…' : (
                      <>
                        <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
                        Doplnit
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setShow(false); setResult(null); setError(''); }}
                    className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 transition-colors"
                  >
                    Zrušit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
