'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

type Config = {
  id: number;
  name: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  rules: unknown;
  createdAt: string;
  updatedAt: string;
  _count: { orders: number };
};

const TEMPLATE = JSON.stringify(
  {
    version: 1,
    missingValuePolicy: 'warn',
    rules: [
      {
        key: 'weightBracket',
        label: 'Velikost (g)',
        type: 'bracket',
        source: 'weightGrams',
        missingPolicy: 'error',
        brackets: [
          { min: 0, max: 3, marginRate: 1.0 },
          { min: 3, max: 10, marginRate: 1.5 },
          { min: 10, max: null, marginRate: 2.0 },
        ],
      },
      {
        key: 'shape',
        type: 'category',
        source: 'pasShape',
        items: [
          { value: 'drop', marginRate: 0.7 },
          { value: 'disc', marginRate: 0.5 },
        ],
      },
      {
        key: 'damage',
        type: 'category',
        source: 'attrDamage',
        items: [
          { value: 'none', marginRate: 0 },
          { value: 'minor', marginRate: -0.1 },
          { value: 'major', marginRate: -0.25 },
        ],
      },
      {
        key: 'collectible',
        type: 'boolean',
        source: 'attrCollectible',
        marginRate: 0.3,
      },
    ],
  },
  null,
  2
);

export default function PricingConfigClient({ configs }: { configs: Config[] }) {
  const router = useRouter();
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  async function activate(id: number) {
    if (!confirm('Aktivovat tuto konfiguraci? Ostatní se deaktivují (existující zakázky se přepočítají až ručně).')) return;
    const res = await apiFetch(`/api/pricing-config/${id}/activate`, { method: 'POST' });
    if (res.ok) router.refresh();
  }

  async function remove(id: number, name: string, orderCount: number) {
    if (orderCount > 0) {
      alert(`Konfiguraci "${name}" používá ${orderCount} zakázek — nelze smazat. (Zakázky mají vlastní snapshot, ale dropdown by ztratil odkaz.)`);
      return;
    }
    if (!confirm(`Smazat konfiguraci "${name}"?`)) return;
    const res = await apiFetch(`/api/pricing-config/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Cenotvorba — konfigurace marží</h1>
          <p className="text-sm text-muted-foreground mt-1">Pravidla pro výpočet maržových přirážek podle atributů kamene</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2"
        >
          + Nová konfigurace
        </button>
      </div>

      {creating && (
        <ConfigForm
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}

      <div className="space-y-3">
        {configs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">Žádné konfigurace. Vytvoř první a aktivuj ji.</p>
          </div>
        ) : (
          configs.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl shadow-sm">
              {editId === c.id ? (
                <div className="p-4">
                  <ConfigForm
                    config={c}
                    onCancel={() => setEditId(null)}
                    onSaved={() => { setEditId(null); router.refresh(); }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between p-5 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold">{c.name}</h3>
                      {c.active && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border"
                          style={{
                            color: 'var(--success)',
                            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                          }}
                        >
                          aktivní
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Pravidel: {Array.isArray((c.rules as { rules?: unknown[] }).rules) ? ((c.rules as { rules: unknown[] }).rules.length) : 0}
                      {' · '}
                      Zakázek: {c._count.orders}
                      {' · '}
                      Vytvořeno: {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!c.active && (
                      <button
                        onClick={() => activate(c.id)}
                        style={{
                          color: 'var(--success)',
                          borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                        }}
                        className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
                      >
                        Aktivovat
                      </button>
                    )}
                    <button
                      onClick={() => setEditId(c.id)}
                      className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => remove(c.id, c.name, c._count.orders)}
                      style={{ color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}
                      className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors"
                    >
                      Smazat
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConfigForm({
  config,
  onCancel,
  onSaved,
}: {
  config?: Config;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(config?.name ?? '');
  const [rulesText, setRulesText] = useState(config ? JSON.stringify(config.rules, null, 2) : TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    let rules: unknown;
    try {
      rules = JSON.parse(rulesText);
    } catch (err) {
      setError(`Neplatný JSON: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
      return;
    }
    const url = config ? `/api/pricing-config/${config.id}` : '/api/pricing-config';
    const method = config ? 'PATCH' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rules }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error + (data.issues ? '\n' + data.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('\n') : ''));
    }
  }

  const inputCls = 'w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';
  const labelCls = 'block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono';

  return (
    <form onSubmit={handleSubmit} className="bg-muted/40 border border-border rounded-xl p-4">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Název</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standardní 2026" className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Pravidla (JSON)</label>
          <textarea
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={20}
            className={`${inputCls} font-mono text-xs resize-y`}
            spellCheck={false}
          />
          <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
            Struktura: <code>{`{ version, missingValuePolicy: 'zero'|'warn'|'error', rules: [...] }`}</code>.
            Pravidlo: <code>bracket</code> / <code>category</code> / <code>multi-category</code> / <code>boolean</code>.
            marginRate je decimální multiplikátor (1.5 = +150%, -0.1 = -10%).
          </p>
        </div>
        {error && (
          <pre className="text-destructive text-xs bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] rounded-lg px-3 py-2 whitespace-pre-wrap">{error}</pre>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider">
          {saving ? 'Ukládám…' : config ? 'Uložit' : 'Vytvořit'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
          Zrušit
        </button>
      </div>
    </form>
  );
}
