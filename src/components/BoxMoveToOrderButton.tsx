'use client';

/**
 * BoxMoveToOrderButton — modal pro přesun kazety mezi zakázkami.
 *
 * Workflow:
 *  1. User klikne „Přesunout do zakázky" v BoxDetail header
 *  2. Načte se seznam zakázek (kromě aktuální)
 *  3. User vybere cílovou + potvrdí
 *  4. PATCH /api/boxes/[id] s `orderId` — server udělá:
 *     - update Box.orderId
 *     - sync všech Item.orderId na novou hodnotu
 *     - recalc obou zakázek (zdrojová + cílová)
 *  5. router.refresh → user vidí novou zakázku v breadcrumbu
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

type OrderOption = { id: number; code: string; title: string | null };

export default function BoxMoveToOrderButton({
  boxId,
  boxCode,
  currentOrderId,
  currentOrderCode,
}: {
  boxId: number;
  boxCode: string;
  currentOrderId: number | null;
  currentOrderCode: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<OrderOption[] | null>(null);
  const [target, setTarget] = useState<string>(''); // empty = '' = oddělit (skladová); jinak orderId string
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || orders !== null) return;
    (async () => {
      const res = await apiFetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        // /api/orders vraci array Order objektu
        const list: OrderOption[] = Array.isArray(data) ? data : (data.orders ?? []);
        setOrders(list.filter((o) => o.id !== currentOrderId));
      } else {
        setError(`Načítání zakázek selhalo (${res.status})`);
      }
    })();
  }, [open, orders, currentOrderId]);

  async function move() {
    setBusy(true);
    setError(null);
    const payload = target === '' ? { orderId: null } : { orderId: Number(target) };
    const res = await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `HTTP ${res.status}`);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
        title="Přesunout kazetu do jiné zakázky"
      >
        <Icon name="merge" className="w-3.5 h-3.5" />
        Přesun
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2">Přesunout kazetu {boxCode}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {currentOrderCode ? (
                <>Aktuálně v zakázce <span className="font-mono font-semibold text-foreground">{currentOrderCode}</span>. Vyber cílovou zakázku (nebo „skladová" pro oddělení).</>
              ) : (
                <>Kazeta je momentálně skladová (bez zakázky). Vyber zakázku do které ji chceš přiřadit.</>
              )}
            </p>

            <label className="block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
              Cílová zakázka
            </label>
            {orders === null ? (
              <p className="text-sm text-muted-foreground py-2">Načítám…</p>
            ) : (
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— skladová (bez zakázky) —</option>
                {orders.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.code}{o.title ? ` — ${o.title}` : ''}
                  </option>
                ))}
              </select>
            )}

            <div className="mt-3 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Co se stane po přesunu:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Všechny kameny v kazetě se přesunou do cílové zakázky</li>
                <li>Obě zakázky (zdrojová + cílová) se automaticky přepočítají</li>
                <li>Ceny kamenů se aktualizují podle cenotvorby cílové zakázky</li>
              </ul>
            </div>

            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={move}
                disabled={busy || orders === null}
                style={{ background: busy || orders === null ? undefined : 'var(--primary)' }}
                className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity"
              >
                {busy ? 'Přesouvám…' : 'Přesunout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
