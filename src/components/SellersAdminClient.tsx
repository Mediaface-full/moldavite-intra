'use client';

/**
 * Admin UI pro Sellers (dodavatele). Inline CRUD:
 *  - vytvoření nového dodavatele formulářem nahoře
 *  - editace polí přímo v řádce (klik → input)
 *  - deaktivace (active=false) místo smazání, pokud má orders/boxes
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

type Seller = {
  id: number;
  firstName: string;
  lastName: string;
  alias: string;
  phone: string;
  email: string;
  note: string;
  active: boolean;
  _count: { orders: number; boxes: number };
};

export default function SellersAdminClient({ initial }: { initial: Seller[] }) {
  const router = useRouter();
  const [sellers, setSellers] = useState<Seller[]>(initial);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', alias: '', phone: '', email: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const res = await apiFetch(`/api/sellers${showInactive ? '?all=1' : ''}`);
    if (res.ok) {
      const data = await res.json();
      setSellers(data);
    } else {
      router.refresh();
    }
  }

  async function createSeller() {
    if (!draft.firstName.trim() && !draft.lastName.trim() && !draft.alias.trim()) {
      setError('Vyplň aspoň jedno: jméno, příjmení nebo přezdívku.');
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
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Vytvoření selhalo');
      return;
    }
    setDraft({ firstName: '', lastName: '', alias: '', phone: '', email: '', note: '' });
    setAdding(false);
    refresh();
  }

  async function patch(id: number, body: Partial<Seller>) {
    await apiFetch(`/api/sellers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    refresh();
  }

  async function remove(s: Seller) {
    if (s._count.orders > 0 || s._count.boxes > 0) {
      alert(`Dodavatel má ${s._count.orders} zakázek a ${s._count.boxes} kazet — nelze smazat. Použij "Deaktivovat".`);
      return;
    }
    if (!confirm(`Smazat dodavatele "${displayName(s)}"? Tato akce je nevratná.`)) return;
    await apiFetch(`/api/sellers/${s.id}`, { method: 'DELETE' });
    refresh();
  }

  const visible = showInactive ? sellers : sellers.filter(s => s.active);

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight inline-flex items-center gap-3">
            <Icon name="truck" className="w-7 h-7" />
            Dodavatelé
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lidé, od kterých kupujeme kameny. Přiřazují se k zakázkám (Order) i kazetám (Box) — v jedné zakázce může být MIX (různé kazety od různých dodavatelů).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); setTimeout(refresh, 0); }}
              className="rounded border-border"
            />
            Včetně neaktivních
          </label>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="text-white px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-2"
              style={{ background: 'var(--success)' }}
            >
              <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
              Nový dodavatel
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4 inline-flex items-center gap-2">
            <Icon name="plus" className="w-4 h-4" /> Nový dodavatel
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Field label="Jméno" value={draft.firstName} onChange={(v) => setDraft({ ...draft, firstName: v })} />
            <Field label="Příjmení" value={draft.lastName} onChange={(v) => setDraft({ ...draft, lastName: v })} />
            <Field label="Přezdívka / alias" value={draft.alias} onChange={(v) => setDraft({ ...draft, alias: v })} />
            <Field label="Telefon" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
            <Field label="E-mail" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
            <Field label="Poznámka" value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} />
          </div>
          {error && <p className="text-destructive text-xs mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createSeller}
              disabled={busy}
              className="disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
              style={{ background: 'var(--success)' }}
            >
              <Icon name="save" className="w-4 h-4" />
              {busy ? 'Ukládám…' : 'Vytvořit'}
            </button>
            <button
              onClick={() => { setAdding(false); setDraft({ firstName: '', lastName: '', alias: '', phone: '', email: '', note: '' }); setError(''); }}
              className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Icon name="truck" className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Žádní dodavatelé. Přidej prvního přes tlačítko nahoře.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Jméno / alias</th>
                <th className="text-left px-4 py-3">Kontakt</th>
                <th className="text-left px-4 py-3">Poznámka</th>
                <th className="text-right px-4 py-3">Statistika</th>
                <th className="text-right px-4 py-3 w-1">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((s) => (
                <tr key={s.id} className={`hover:bg-muted/20 ${s.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      <InlineText value={`${s.firstName} ${s.lastName}`.trim()} placeholder="(bez jména)" onSave={(v) => {
                        const [first, ...rest] = v.split(' ');
                        patch(s.id, { firstName: first || '', lastName: rest.join(' ') });
                      }} />
                    </div>
                    {s.alias && (
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        „<InlineText value={s.alias} onSave={(v) => patch(s.id, { alias: v })} />"
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-foreground"><InlineText value={s.phone} placeholder="+ tel" onSave={(v) => patch(s.id, { phone: v })} /></div>
                    <div className="text-muted-foreground"><InlineText value={s.email} placeholder="+ e-mail" onSave={(v) => patch(s.id, { email: v })} /></div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                    <InlineText value={s.note} placeholder="+ poznámka" onSave={(v) => patch(s.id, { note: v })} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono">
                    <div>{s._count.orders} zakázek</div>
                    <div className="text-muted-foreground">{s._count.boxes} kazet</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => patch(s.id, { active: !s.active })}
                        className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                          s.active
                            ? 'border-border text-muted-foreground hover:text-foreground'
                            : 'border-warning text-warning hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]'
                        }`}
                        title={s.active ? 'Deaktivovat' : 'Aktivovat'}
                      >
                        <Icon name={s.active ? 'eye' : 'eye-off'} className="w-3 h-3" />
                        {s.active ? 'Aktivní' : 'Skrytý'}
                      </button>
                      {s._count.orders === 0 && s._count.boxes === 0 && (
                        <button
                          onClick={() => remove(s)}
                          style={{ color: 'var(--destructive)' }}
                          className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]"
                          title="Smazat"
                        >
                          <Icon name="trash" className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function displayName(s: Pick<Seller, 'firstName' | 'lastName' | 'alias'>): string {
  const name = `${s.firstName} ${s.lastName}`.trim();
  if (name && s.alias) return `${name} (${s.alias})`;
  return name || s.alias || '(bez jména)';
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-mono">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}

function InlineText({ value, placeholder, onSave }: { value: string; placeholder?: string; onSave: (v: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`text-left ${value ? 'text-foreground' : 'text-muted-foreground italic'} hover:text-primary transition-colors`}
      >
        {value || placeholder || '—'}
      </button>
    );
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); if (draft !== value) onSave(draft); }
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      }}
      autoFocus
      className="bg-card border border-border rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-ring"
    />
  );
}
