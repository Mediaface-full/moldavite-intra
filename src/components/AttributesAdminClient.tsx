'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon, { type IconName } from './Icon';

type AttrOption = {
  id: number;
  attrKey: string;
  value: string;
  label: string | null;
  labelEn: string | null;
  sortOrder: number;
  active: boolean;
};

const SECTIONS: Array<{ key: string; title: string; description: string; icon: IconName }> = [
  {
    key: 'cassetteType',
    title: 'Typ kazety',
    description: 'Kategorie kazety podle obsahu (Kameny, Opracované kusy, K opracování, Prach…). Používá se v dropdownu na detailu kazety a v Order overview.',
    icon: 'cassette-stones',
  },
  {
    key: 'pasShape',
    title: 'Tvar (PAS)',
    description: 'Primary Aerodynamic Shape — tvar vltavínu. Používá se v cenotvorbě a v detailu kamene.',
    icon: 'shape',
  },
  {
    key: 'attrDamage',
    title: 'Poškození',
    description: 'Míra poškození kamene. Samostatný atribut — nevazaný na velikostní kategorii. Používá se v cenotvorbě pokud máš v PricingConfig „Bonus podle poškození".',
    icon: 'damage',
  },
  {
    key: 'location',
    title: 'Místo nálezu',
    description: 'Místo, kde byl kámen vykopán. Volitelné pole v detailu kamene.',
    icon: 'location',
  },
  {
    key: 'attrColor',
    title: 'Barva',
    description: 'Multi-výběr — kámen může mít víc barev najednou (např. zelená + radioaktivní).',
    icon: 'palette',
  },
];

export default function AttributesAdminClient({ initialGrouped }: { initialGrouped: Record<string, AttrOption[]> }) {
  const router = useRouter();
  const [grouped, setGrouped] = useState(initialGrouped);

  async function refresh() {
    const res = await apiFetch('/api/attr-options?includeInactive=1');
    if (res.ok) {
      const data: AttrOption[] = await res.json();
      const g: Record<string, AttrOption[]> = {};
      for (const o of data) {
        if (!g[o.attrKey]) g[o.attrKey] = [];
        g[o.attrKey].push(o);
      }
      setGrouped(g);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
          Bohemian Moldavite · Intra
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Atributy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Řízené hodnoty pro atributy kamenů — tvar, poškození, lokalita, barva. Změny se projeví v dropdownech v detailu kamene.
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <SectionBlock
            key={s.key}
            attrKey={s.key}
            title={s.title}
            description={s.description}
            icon={s.icon}
            options={grouped[s.key] ?? []}
            onChange={refresh}
          />
        ))}
      </div>
    </div>
  );
}

function SectionBlock({
  attrKey,
  title,
  description,
  icon,
  options,
  onChange,
}: {
  attrKey: string;
  title: string;
  description: string;
  icon: IconName;
  options: AttrOption[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Edit mode per-row — null = nic se needituje, jinak ID otevřené hodnoty.
  // Externí EDIT tlačítko v action baru řádku tuto state nastaví.
  const [editingId, setEditingId] = useState<number | null>(null);

  async function addOption() {
    if (newValue.trim().length === 0) return;
    setBusy(true);
    setError('');
    const sortOrder = options.length > 0 ? Math.max(...options.map((o) => o.sortOrder)) + 10 : 0;
    const res = await apiFetch('/api/attr-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attrKey, value: newValue.trim(), sortOrder }),
    });
    setBusy(false);
    if (res.ok) {
      setNewValue('');
      setAdding(false);
      onChange();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Přidání selhalo');
    }
  }

  async function toggleActive(opt: AttrOption) {
    await apiFetch(`/api/attr-options/${opt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !opt.active }),
    });
    onChange();
  }

  async function updateValue(opt: AttrOption, newVal: string) {
    setEditingId(null); // close edit mode regardless of result
    if (newVal.trim() === opt.value || newVal.trim().length === 0) return;
    const res = await apiFetch(`/api/attr-options/${opt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newVal.trim() }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const cascade = data?._meta?.cascadeCount ?? 0;
      if (cascade > 0) {
        alert(`Přejmenováno na "${newVal.trim()}". Cascade update na ${cascade} záznamech (kameny / kazety).`);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Přejmenování selhalo: ${data.error ?? res.status}`);
    }
    onChange();
  }

  async function updateLabelEn(opt: AttrOption, newLabelEn: string) {
    const trimmed = newLabelEn.trim();
    if (trimmed === (opt.labelEn ?? '')) return;
    await apiFetch(`/api/attr-options/${opt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelEn: trimmed || null }),
    });
    onChange();
  }

  async function remove(opt: AttrOption) {
    if (!confirm(`Smazat hodnotu "${opt.value}"?`)) return;
    let res = await apiFetch(`/api/attr-options/${opt.id}`, { method: 'DELETE' });
    if (res.status === 409) {
      // Hodnotu drží X kamenů — vyžádaj explicit force
      const data = await res.json().catch(() => ({}));
      const usages = data.usages ?? '?';
      const forceMsg = `⚠ ${data.error}\n\nDoporučená alternativa: jen schovej přes Active toggle — kameny si hodnotu nechají.\n\nOpravdu smazat i přesto?`;
      if (!confirm(forceMsg)) { onChange(); return; }
      res = await apiFetch(`/api/attr-options/${opt.id}?force=1`, { method: 'DELETE' });
      if (res.ok) {
        alert(`Smazáno. ${usages} záznamů zůstává s orphan hodnotou „${opt.value}".`);
      } else {
        const data2 = await res.json().catch(() => ({}));
        alert(`Smazání selhalo: ${data2.error ?? res.status}`);
      }
    } else if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Smazání selhalo: ${data.error ?? res.status}`);
    }
    onChange();
  }

  async function move(opt: AttrOption, direction: -1 | 1) {
    // Sort dle (sortOrder ASC, value ASC) — fallback pro legacy data kde
    // víc řádků má stejný sortOrder (často 0 po starém seedu) → tabilní
    // sekundární klíč zachová deterministic order.
    const sorted = [...options].sort((a, b) => {
      const so = a.sortOrder - b.sortOrder;
      if (so !== 0) return so;
      return a.value.localeCompare(b.value);
    });
    const idx = sorted.findIndex((o) => o.id === opt.id);
    const swap = sorted[idx + direction];
    if (!swap) return;

    // Pokud mají oba stejný sortOrder (legacy default 0), prostý swap by
    // nic neudělal. Místo toho renumber CELÉ pole na 0,10,20,...,N*10
    // se swapnutými pozicemi opt a swap. Atomic, deterministic.
    const newOrder = sorted.slice();
    newOrder[idx] = swap;
    newOrder[idx + direction] = opt;

    // Sequenčně (ne Promise.all) — pokud něco selže, vidíme to v alertu
    // a refresh zobrazí aktuální stav místo polorozhozeného.
    try {
      for (let i = 0; i < newOrder.length; i++) {
        const target = newOrder[i];
        const newSort = i * 10;
        if (target.sortOrder === newSort) continue; // skip no-op
        const res = await apiFetch(`/api/attr-options/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newSort }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${res.status}`);
        }
      }
    } catch (err) {
      alert(`Posun selhal: ${err instanceof Error ? err.message : String(err)}`);
    }
    onChange();
  }

  const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 mt-0.5"
            style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
          >
            <Icon name={icon} className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-2">
              attrKey: <code className="text-foreground">{attrKey}</code> · {options.length} hodnot ({sorted.filter((o) => o.active).length} aktivních)
            </p>
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ background: 'var(--success)' }}
            className="text-white hover:opacity-90 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity inline-flex items-center gap-2 flex-shrink-0"
          >
            <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
            Přidat
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={`Nová hodnota pro ${title.toLowerCase()}`}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') addOption(); if (e.key === 'Escape') { setAdding(false); setNewValue(''); setError(''); } }}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={addOption}
            disabled={busy || newValue.trim().length === 0}
            style={{ background: busy || newValue.trim().length === 0 ? undefined : 'var(--success)' }}
            className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-opacity"
          >
            {busy ? 'Přidávám…' : 'Uložit'}
          </button>
          <button
            onClick={() => { setAdding(false); setNewValue(''); setError(''); }}
            className="px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            Zrušit
          </button>
        </div>
      )}
      {error && (
        <div className="px-5 py-2 text-sm text-destructive border-b border-border">{error}</div>
      )}

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Žádné hodnoty. Přidej první.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((opt, idx) => (
            <li key={opt.id} className={`flex items-center gap-2 px-5 py-2.5 ${opt.active ? '' : 'opacity-50'}`}>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => move(opt, -1)}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Posunout nahoru"
                >
                  <Icon name="arrow-up" className="w-3 h-3" />
                </button>
                <button
                  onClick={() => move(opt, 1)}
                  disabled={idx === sorted.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Posunout dolů"
                >
                  <Icon name="arrow-down" className="w-3 h-3" />
                </button>
              </div>
              <InlineEditValue
                value={opt.value}
                editing={editingId === opt.id}
                onSave={async (v) => { await updateValue(opt, v); }}
                onCancel={() => setEditingId(null)}
              />
              <InlineEditLabelEn
                value={opt.labelEn ?? ''}
                placeholder="EN překlad"
                onSave={(v) => updateLabelEn(opt, v)}
              />
              <span className="text-[10px] text-muted-foreground font-mono ml-auto flex-shrink-0">
                sort: {opt.sortOrder}
              </span>
              <button
                onClick={() => setEditingId(editingId === opt.id ? null : opt.id)}
                className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                  editingId === opt.id
                    ? 'border-primary text-primary bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                title={editingId === opt.id ? 'Zavřít editaci' : 'Upravit hodnotu'}
              >
                <Icon name="edit" className="w-3 h-3" />
                {editingId === opt.id ? 'Zavřít' : 'Edit'}
              </button>
              <button
                onClick={() => toggleActive(opt)}
                className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                  opt.active
                    ? 'border-border text-muted-foreground hover:text-foreground'
                    : 'border-warning text-warning hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]'
                }`}
                title={opt.active ? 'Skrýt z dropdownů' : 'Zobrazit v dropdownech'}
              >
                <Icon name={opt.active ? 'eye' : 'eye-off'} className="w-3 h-3" />
                {opt.active ? 'Aktivní' : 'Skrytá'}
              </button>
              <button
                onClick={() => remove(opt)}
                style={{ color: 'var(--destructive)' }}
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] transition-colors"
                title="Smazat"
              >
                <Icon name="trash" className="w-3 h-3" />
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Controlled inline editor pro CZ hodnotu. Edit state drží parent přes
 * `editing` + `onCancel` (Escape / blur). Edit button je oddělený v action
 * baru vpravo (per Gideon 22. 6.) — text samotný neni klikatelny.
 */
function InlineEditValue({
  value, editing, onSave, onCancel,
}: {
  value: string;
  editing: boolean;
  onSave: (v: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(value);
  // Sync local buffer when value changes externally (po cascade rename apod.)
  // nebo když se editing toggluje (reset bufferu na aktuální)
  // useEffect není potřeba — controlled prop pattern: každý re-render aktualizuje
  // pokud editing přejde false→true, val už drží stará hodnota → ok pro inline edit.

  if (editing) {
    return (
      <input
        type="text"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { onCancel(); onSave(val); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setVal(value); onCancel(); }
        }}
        className="flex-1 bg-card border border-ring rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
    );
  }
  return (
    <span className="flex-1 text-sm text-foreground">{value}</span>
  );
}

/**
 * Inline editor pro EN překlad — kompaktnější, no edit button, focus-on-click.
 * Prázdný stav: muted placeholder „EN překlad" → kliknout pro psaní.
 */
function InlineEditLabelEn({
  value, onSave, placeholder,
}: { value: string; onSave: (v: string) => void | Promise<void>; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (editing) {
    return (
      <input
        type="text"
        value={val}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onSave(val); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setVal(value); setEditing(false); }
        }}
        className="w-32 bg-card border border-ring rounded-md px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors flex-shrink-0 w-32 text-left truncate"
      title="Anglický překlad pro EN export / katalog"
    >
      {value || <span className="italic opacity-60">{placeholder}</span>}
    </button>
  );
}
