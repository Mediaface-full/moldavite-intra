'use client';

/**
 * Picker typu kazety — hodnoty fetchované z AttrOption (attrKey="cassetteType").
 * Inline select v BoxDetail headeru — po změně PATCH /api/boxes/[id]
 * a router.refresh. UI label + ikona + barva přes getCassetteTypeMeta
 * (známé 4 mají hardcoded styl, vlastní typy fallback).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { getCassetteTypeMeta } from '@/lib/cassetteType';
import Icon from './Icon';

type Option = { id: number; value: string; sortOrder: number; active: boolean };

export default function CassetteTypePicker({
  boxId,
  current,
}: {
  boxId: number;
  current: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string>(current);
  const [options, setOptions] = useState<Option[]>([]);
  const meta = getCassetteTypeMeta(value);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/attr-options?key=cassetteType').then(async (r) => {
      if (alive && r.ok) setOptions(await r.json());
    });
    return () => { alive = false; };
  }, []);

  async function change(next: string) {
    if (next === value || saving) return;
    setSaving(true);
    setValue(next);
    const res = await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cassetteType: next }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      setValue(current);
      alert('Změna typu kazety selhala');
    }
  }

  // Pokud aktuální hodnota není v aktivním seznamu (legacy), zobraz ji v selectu
  const hasCurrent = options.some((o) => o.value === value);

  return (
    <label
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border cursor-pointer transition-colors"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
        opacity: saving ? 0.5 : 1,
      }}
      title="Změnit typ kazety"
    >
      <Icon name={meta.icon} className="w-3.5 h-3.5" />
      <select
        value={value}
        disabled={saving || options.length === 0}
        onChange={(e) => change(e.target.value)}
        className="bg-transparent border-0 outline-none font-mono uppercase tracking-wider text-xs cursor-pointer"
        style={{ color: meta.color }}
      >
        {!hasCurrent && value && (
          <option value={value}>{value} (mimo aktivní)</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.value}>{o.value}</option>
        ))}
      </select>
    </label>
  );
}
