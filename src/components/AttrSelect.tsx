'use client';

/**
 * Single-select dropdown s hodnotami z AttrOption (DB řízený seznam).
 * Fetch při mountu, cache v `useState`. Pokud se hodnoty změní v admin
 * sekci, uživatel uvidí novou sadu po reloadu stránky.
 *
 * Použití:
 *   <AttrSelect attrKey="pasShape" value={value} onChange={setValue} />
 *   <AttrSelect attrKey="attrDamage" value={...} onChange={...} placeholder="— vyber —" />
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

type Option = { id: number; value: string; label: string | null; sortOrder: number; active: boolean };

export default function AttrSelect({
  attrKey,
  value,
  onChange,
  placeholder = '— vyber —',
  className,
  allowEmpty = true,
}: {
  attrKey: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
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

  // Pokud aktuální hodnota není mezi aktivními (např. legacy z dřívějška),
  // přidáme ji do seznamu disabled, aby uživatel viděl co je vybráno.
  const hasCurrent = !value || options.some((o) => o.value === value);

  const baseCls = 'w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
      className={className ?? baseCls}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
      {!hasCurrent && value && (
        <option value={value}>{value} (mimo aktivní seznam)</option>
      )}
      {options.map((o) => (
        <option key={o.id} value={o.value}>{o.label ?? o.value}</option>
      ))}
    </select>
  );
}
