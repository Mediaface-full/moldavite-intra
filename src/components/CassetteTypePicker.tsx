'use client';

/**
 * Picker typu kazety (STONES / PROCESSED / TO_PROCESS / DUST).
 * Inline select v BoxDetail headeru — po změně PATCH /api/boxes/[id]
 * a router.refresh.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { CASSETTE_TYPES, CASSETTE_TYPE_META, type CassetteType } from '@/lib/cassetteType';
import Icon from './Icon';

export default function CassetteTypePicker({
  boxId,
  current,
}: {
  boxId: number;
  current: CassetteType;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<CassetteType>(current);
  const meta = CASSETTE_TYPE_META[value];

  async function change(next: CassetteType) {
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
      setValue(current); // rollback
      alert('Změna typu kazety selhala');
    }
  }

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
        disabled={saving}
        onChange={(e) => change(e.target.value as CassetteType)}
        className="bg-transparent border-0 outline-none font-mono uppercase tracking-wider text-xs cursor-pointer"
        style={{ color: meta.color }}
      >
        {CASSETTE_TYPES.map((t) => (
          <option key={t} value={t}>{CASSETTE_TYPE_META[t].label}</option>
        ))}
      </select>
    </label>
  );
}
