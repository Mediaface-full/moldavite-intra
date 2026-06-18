'use client';

/**
 * Dropdown pro výběr Selleru (dodavatele). Načítá seznam z /api/sellers,
 * umožňuje quick-create přes inline "+nový" tlačítko.
 *
 * Use:
 *   <SellerPicker value={order.sellerId} onChange={(id) => save({ sellerId: id })} />
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

type SellerOption = {
  id: number;
  firstName: string;
  lastName: string;
  alias: string;
  active: boolean;
};

export function sellerDisplayName(s: Pick<SellerOption, 'firstName' | 'lastName' | 'alias'>): string {
  const name = `${s.firstName} ${s.lastName}`.trim();
  if (name && s.alias) return `${name} (${s.alias})`;
  return name || s.alias || '(bez jména)';
}

export default function SellerPicker({
  value,
  onChange,
  className,
  allowEmpty = true,
}: {
  value: number | null;
  onChange: (id: number | null) => void | Promise<void>;
  className?: string;
  allowEmpty?: boolean;
}) {
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', alias: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const res = await apiFetch('/api/sellers');
    if (res.ok) setSellers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createInline() {
    if (!draft.firstName.trim() && !draft.lastName.trim() && !draft.alias.trim()) {
      setError('Aspoň jedno: jméno, příjmení, alias.');
      return;
    }
    setBusy(true); setError('');
    const res = await apiFetch('/api/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Selhalo');
      return;
    }
    const newSeller = await res.json();
    setDraft({ firstName: '', lastName: '', alias: '' });
    setCreating(false);
    await load();
    await onChange(newSeller.id);
  }

  return (
    <div className={className}>
      <div className="flex gap-1.5">
        <select
          value={value ?? ''}
          disabled={loading}
          onChange={(e) => {
            const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
            onChange(v);
          }}
          className="flex-1 min-w-0 bg-card border border-border rounded-md px-3 h-9 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          {allowEmpty && <option value="">— bez dodavatele —</option>}
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>{sellerDisplayName(s)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(!creating)}
          className="bg-card border border-border hover:border-foreground/40 px-2 h-9 rounded-md inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="Přidat nového dodavatele"
        >
          <Icon name={creating ? 'x' : 'plus'} className="w-4 h-4" />
        </button>
      </div>

      {creating && (
        <div className="mt-2 bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Jméno"
              value={draft.firstName}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              className="bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
            />
            <input
              type="text"
              placeholder="Příjmení"
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              className="bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
            />
            <input
              type="text"
              placeholder="Alias"
              value={draft.alias}
              onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
              className="bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createInline}
              disabled={busy}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-1.5 rounded text-xs font-mono uppercase tracking-wider"
            >
              {busy ? 'Vytvářím…' : 'Vytvořit + vybrat'}
            </button>
            <a
              href="/admin/sellers"
              className="text-xs text-muted-foreground hover:text-foreground self-center px-2"
              title="Detailní správa dodavatelů"
            >
              Správa →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
