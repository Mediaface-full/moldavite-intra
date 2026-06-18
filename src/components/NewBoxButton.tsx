'use client';

/**
 * Tlačítko + modal pro založení nové kazety.
 * - Buď přiřazené k zakázce (orderId prop) — typicky z Order detail header
 * - Nebo volné (orderId=null) — z /boxes seznamu (později)
 *
 * Předvyplní cassetteType "Kameny", sellerId podědí z Order (pokud je předán
 * `defaultSellerId`). Po vytvoření router.push na detail nové kazety.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';
import SellerPicker from './SellerPicker';

type AttrOption = { id: number; value: string; sortOrder: number };

export default function NewBoxButton({
  orderId,
  defaultSellerId,
  variant = 'button',
}: {
  orderId: number | null;
  defaultSellerId?: number | null;
  variant?: 'button' | 'primary';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cassetteTypes, setCassetteTypes] = useState<AttrOption[]>([]);

  const [name, setName] = useState('');
  const [cassetteType, setCassetteType] = useState('Kameny');
  const [sellerId, setSellerId] = useState<number | null>(defaultSellerId ?? null);
  const [declaredPieces, setDeclaredPieces] = useState('');
  const [declaredWeight, setDeclaredWeight] = useState('');
  const [purchaseAmountCzk, setPurchaseAmountCzk] = useState('');
  const [placement, setPlacement] = useState('');

  useEffect(() => {
    if (!open) return;
    apiFetch('/api/attr-options?key=cassetteType').then(async (r) => {
      if (r.ok) setCassetteTypes(await r.json());
    });
  }, [open]);

  // Když se otevře modal, sync defaultSellerId
  useEffect(() => {
    if (open) setSellerId(defaultSellerId ?? null);
  }, [open, defaultSellerId]);

  function reset() {
    setName('');
    setCassetteType('Kameny');
    setSellerId(defaultSellerId ?? null);
    setDeclaredPieces('');
    setDeclaredWeight('');
    setPurchaseAmountCzk('');
    setPlacement('');
    setError('');
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  async function submit() {
    setBusy(true); setError('');
    const body: Record<string, unknown> = {
      name: name.trim() || undefined,
      cassetteType,
      placement: placement.trim() || undefined,
      orderId,
      sellerId,
    };
    if (declaredPieces) {
      const n = parseInt(declaredPieces, 10);
      if (!Number.isInteger(n) || n < 0) {
        setError('Počet kamenů musí být celé nezáporné číslo');
        setBusy(false);
        return;
      }
      body.declaredPieces = n;
    }
    if (declaredWeight) {
      const n = Number(declaredWeight);
      if (!Number.isFinite(n) || n < 0) {
        setError('Váha kazety musí být ≥ 0');
        setBusy(false);
        return;
      }
      body.declaredWeight = n;
    }
    if (purchaseAmountCzk) {
      const n = Number(purchaseAmountCzk);
      if (!Number.isFinite(n) || n < 0) {
        setError('Nákupní cena musí být ≥ 0');
        setBusy(false);
        return;
      }
      body.purchaseAmountCzk = n;
    }
    const res = await apiFetch('/api/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || `HTTP ${res.status}`);
      return;
    }
    const box = await res.json();
    setOpen(false);
    router.push(`/boxes/${box.id}`);
    router.refresh();
  }

  const trigger = variant === 'primary' ? (
    <button
      onClick={() => setOpen(true)}
      className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
    >
      <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
      Založit kazetu
    </button>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
    >
      <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
      Založit kazetu
    </button>
  );

  return (
    <>
      {trigger}

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold inline-flex items-center gap-2">
                <Icon name="box" className="w-5 h-5" />
                Nová kazeta
              </h3>
              <button onClick={close} className="text-muted-foreground hover:text-foreground" title="Zavřít">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Kód kazety se vygeneruje automaticky (K0001, K0002, …). Vše ostatní můžeš doplnit i později v detailu.
              </p>

              <div>
                <label className={lbl}>Název / poznámka <span className="text-muted-foreground/60 normal-case font-sans">(volitelné)</span></label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder='např. „Z výkopu 12. 6."'
                  autoFocus
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>Typ kazety</label>
                <select value={cassetteType} onChange={(e) => setCassetteType(e.target.value)} className={inp}>
                  {cassetteTypes.length === 0 && (
                    <>
                      <option value="Kameny">Kameny</option>
                      <option value="Opracované kusy">Opracované kusy</option>
                      <option value="K opracování">K opracování</option>
                      <option value="Prach">Prach</option>
                    </>
                  )}
                  {cassetteTypes.map((o) => (
                    <option key={o.id} value={o.value}>{o.value}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Počet kamenů</label>
                  <input
                    type="number" min={0} max={9999} value={declaredPieces}
                    onChange={(e) => setDeclaredPieces(e.target.value)}
                    placeholder="—"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Váha (g)</label>
                  <input
                    type="number" min={0} step="0.01" value={declaredWeight}
                    onChange={(e) => setDeclaredWeight(e.target.value)}
                    placeholder="—"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Cena (Kč)</label>
                  <input
                    type="number" min={0} step="0.01" value={purchaseAmountCzk}
                    onChange={(e) => setPurchaseAmountCzk(e.target.value)}
                    placeholder="—"
                    className={inp}
                  />
                </div>
              </div>

              <div>
                <label className={lbl}>Dodavatel <span className="text-muted-foreground/60 normal-case font-sans">(volitelné — výchozí z zakázky)</span></label>
                <SellerPicker value={sellerId} onChange={(id) => setSellerId(id)} />
              </div>

              <div>
                <label className={lbl}>Umístění <span className="text-muted-foreground/60 normal-case font-sans">(volitelné)</span></label>
                <input
                  type="text" value={placement} onChange={(e) => setPlacement(e.target.value)}
                  placeholder='např. „Radek", „Skříň 2 / police A"'
                  className={inp}
                />
              </div>

              {orderId !== null && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Kazeta bude přiřazena k aktuální zakázce.
                </p>
              )}

              {error && (
                <p className="text-destructive text-xs bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={submit}
                  disabled={busy}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
                  {busy ? 'Zakládám…' : 'Založit'}
                </button>
                <button
                  onClick={close}
                  className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const lbl = 'block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono';
const inp = 'w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';
