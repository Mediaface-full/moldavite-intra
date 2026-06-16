'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import type { SerializedOrder, SerializedCost } from './OrderDetailClient';

const TYPE_KEYS: Array<{ key: string; label: string }> = [
  { key: 'transport', label: 'Doprava' },
  { key: 'photo', label: 'Focení' },
  { key: 'packing', label: 'Balení' },
  { key: 'storage', label: 'Skladování' },
  { key: 'fees', label: 'Poplatky' },
  { key: 'customs', label: 'Clo' },
  { key: 'work', label: 'Práce / čas' },
  { key: 'other', label: 'Jiné' },
];
const ALLOC_LABELS: Record<string, string> = {
  BY_WEIGHT: 'Podle váhy',
  BY_PURCHASE_PRICE: 'Podle ceny',
  EQUAL_PER_PIECE: 'Rovnoměrně',
};

function fmtMoney(n: unknown): string {
  const v = Number(n ?? 0);
  return `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
}

export default function OrderCostsTab({ order }: { order: SerializedOrder }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const total = order.costs.reduce((s, c) => s + Number(c.amountCzk ?? 0), 0);
  const cancelled = order.status === 'CANCELLED';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">Společné náklady</p>
          <p className="text-2xl font-bold tracking-tight font-mono">{fmtMoney(total)}</p>
        </div>
        {!cancelled && (
          <button
            onClick={() => setAdding(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Přidat náklad
          </button>
        )}
      </div>

      {adding && (
        <CostForm
          orderId={order.id}
          orderAllocationMethod={order.allocationMethod}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); router.refresh(); }}
        />
      )}

      {order.costs.length === 0 && !adding ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
          <p className="text-muted-foreground text-sm mb-1">Žádné náklady.</p>
          <p className="text-xs text-muted-foreground font-mono">Přidej dopravu, focení, balné…</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Typ</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Popisek</th>
                <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Alokace</th>
                <th className="text-right px-4 py-3 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Částka</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {order.costs.map((c) =>
                editId === c.id ? (
                  <tr key={c.id} className="border-b border-border bg-muted/20">
                    <td colSpan={5} className="p-4">
                      <CostForm
                        orderId={order.id}
                        orderAllocationMethod={order.allocationMethod}
                        cost={c}
                        onCancel={() => setEditId(null)}
                        onSaved={() => { setEditId(null); router.refresh(); }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {TYPE_KEYS.find((t) => t.key === c.typeKey)?.label ?? c.typeKey}
                    </td>
                    <td className="px-4 py-3 text-foreground">{c.label}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {c.allocationMethodOverride ? ALLOC_LABELS[c.allocationMethodOverride] : <span className="opacity-60">default</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fmtMoney(c.amountCzk)}</td>
                    <td className="px-4 py-3 text-right">
                      {!cancelled && (
                        <button
                          onClick={() => setEditId(c.id)}
                          className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mr-2"
                        >
                          Upravit
                        </button>
                      )}
                      {!cancelled && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Smazat náklad "${c.label}"?`)) return;
                            const res = await apiFetch(`/api/orders/${order.id}/costs/${c.id}`, { method: 'DELETE' });
                            if (res.ok) router.refresh();
                          }}
                          className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Smazat
                        </button>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CostForm({
  orderId,
  orderAllocationMethod,
  cost,
  onCancel,
  onSaved,
}: {
  orderId: number;
  orderAllocationMethod: string;
  cost?: SerializedCost;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [typeKey, setTypeKey] = useState(cost?.typeKey ?? 'transport');
  const [label, setLabel] = useState(cost?.label ?? TYPE_KEYS.find((t) => t.key === 'transport')!.label);
  const [amount, setAmount] = useState(cost?.amountCzk ?? '0');
  const [override, setOverride] = useState<string>(cost?.allocationMethodOverride ?? '');
  const [note, setNote] = useState(cost?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const url = cost ? `/api/orders/${orderId}/costs/${cost.id}` : `/api/orders/${orderId}/costs`;
    const method = cost ? 'PATCH' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typeKey,
        label: label || TYPE_KEYS.find((t) => t.key === typeKey)?.label || typeKey,
        amountCzk: Number(amount) || 0,
        amountSource: Number(amount) || 0,
        allocationMethodOverride: override || null,
        note,
      }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Uložení selhalo');
    }
  }

  const inputCls = 'w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';
  const labelCls = 'block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono';

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-4 mb-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Typ</label>
          <select value={typeKey} onChange={(e) => { setTypeKey(e.target.value); if (!label || label === TYPE_KEYS.find((t) => t.key === typeKey)?.label) setLabel(TYPE_KEYS.find((t) => t.key === e.target.value)?.label ?? ''); }} className={inputCls}>
            {TYPE_KEYS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Popisek</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="DHL kurýr Hamburk → Praha" />
        </div>
        <div>
          <label className={labelCls}>Částka (CZK)</label>
          <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} required />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Alokace (override)</label>
          <select value={override} onChange={(e) => setOverride(e.target.value)} className={inputCls}>
            <option value="">Použij default zakázky ({ALLOC_LABELS[orderAllocationMethod]})</option>
            <option value="BY_WEIGHT">Podle váhy</option>
            <option value="BY_PURCHASE_PRICE">Podle nákupní ceny</option>
            <option value="EQUAL_PER_PIECE">Rovnoměrně na kus</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Poznámka</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </div>
      </div>
      {error && <p className="mt-3 text-destructive text-xs">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider">
          {saving ? 'Ukládám…' : cost ? 'Uložit' : 'Přidat'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
          Zrušit
        </button>
      </div>
    </form>
  );
}
