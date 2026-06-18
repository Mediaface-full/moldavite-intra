'use client';

/**
 * Multi-select pills picker s hodnotami z AttrOption (DB řízený seznam).
 *
 * UI: pod inputem se zobrazí "pillové" hodnoty kterými lze togglovat.
 * Aktivní hodnota = barevný background, neaktivní = ghost. Klik přepne.
 *
 * Použití:
 *   <AttrMultiSelect attrKey="attrColor" value={colors} onChange={setColors} />
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

type Option = { id: number; value: string; label: string | null; sortOrder: number; active: boolean };

export default function AttrMultiSelect({
  attrKey,
  value,
  onChange,
  color = 'var(--primary)',
}: {
  attrKey: string;
  value: string[];
  onChange: (v: string[]) => void;
  color?: string;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch(`/api/attr-options?key=${attrKey}`);
      if (!alive) return;
      if (res.ok) setOptions(await res.json());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [attrKey]);

  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  // Hodnoty mimo aktivní seznam (např. legacy) zobrazíme taky aby šly odebrat.
  const knownValues = new Set(options.map((o) => o.value));
  const orphans = value.filter((v) => !knownValues.has(v));

  if (loading) {
    return <div className="text-xs text-muted-foreground">Načítám…</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.value)}
            style={active ? {
              color,
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
            } : undefined}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
              active
                ? ''
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
            }`}
          >
            {active && <span className="text-[10px]">✓</span>}
            {o.label ?? o.value}
          </button>
        );
      })}
      {orphans.map((v) => (
        <button
          key={`orphan-${v}`}
          type="button"
          onClick={() => toggle(v)}
          title="Hodnota mimo aktivní seznam — klik odebere"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono border border-warning text-warning bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
        >
          ⚠ {v}
        </button>
      ))}
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Žádné hodnoty. Přidej v <a href="/admin/attributes" className="text-primary hover:underline">/admin/attributes</a>.
        </p>
      )}
    </div>
  );
}
