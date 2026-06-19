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
    description: 'Míra poškození kamene. Bez poškození → kámen ≥10g jde do kategorie "Sbírkové", jinak "Velké".',
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
    if (newVal.trim() === opt.value || newVal.trim().length === 0) return;
    await apiFetch(`/api/attr-options/${opt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newVal.trim() }),
    });
    onChange();
  }

  async function remove(opt: AttrOption) {
    if (!confirm(`Smazat hodnotu "${opt.value}"? Existující kameny si ji ponechají, ale v nových dropdownech se neobjeví.`)) return;
    await apiFetch(`/api/attr-options/${opt.id}`, { method: 'DELETE' });
    onChange();
  }

  async function move(opt: AttrOption, direction: -1 | 1) {
    const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((o) => o.id === opt.id);
    const swap = sorted[idx + direction];
    if (!swap) return;
    await Promise.all([
      apiFetch(`/api/attr-options/${opt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: swap.sortOrder }),
      }),
      apiFetch(`/api/attr-options/${swap.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: opt.sortOrder }),
      }),
    ]);
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
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-2 flex-shrink-0"
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
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider"
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
              <InlineEditValue value={opt.value} onSave={(v) => updateValue(opt, v)} />
              <span className="text-[10px] text-muted-foreground font-mono ml-auto flex-shrink-0">
                sort: {opt.sortOrder}
              </span>
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

function InlineEditValue({ value, onSave }: { value: string; onSave: (v: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (editing) {
    return (
      <input
        type="text"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onSave(val); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setVal(value); setEditing(false); }
        }}
        className="flex-1 bg-card border border-ring rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
    );
  }
  // Explicitní tlačítko Upravit (ne jen click-na-text) — uživatel viděl plain
  // text bez vizuálního signálu že je editovatelný. Teď je ikona viditelná
  // vždy, na hover ještě výraznější + podtržení textu.
  return (
    <button
      onClick={() => setEditing(true)}
      className="flex-1 text-left text-sm text-foreground inline-flex items-center gap-2 group hover:text-primary transition-colors"
      title="Klikni pro úpravu hodnoty"
    >
      <span className="group-hover:underline">{value}</span>
      <Icon name="edit" className="w-3 h-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
    </button>
  );
}
