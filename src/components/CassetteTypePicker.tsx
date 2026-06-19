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
  const [loaded, setLoaded] = useState(false);
  const meta = getCassetteTypeMeta(value);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/attr-options?key=cassetteType').then(async (r) => {
      if (!alive) return;
      if (r.ok) setOptions(await r.json());
      setLoaded(true);
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

  // Pokud aktuální hodnota není v aktivním seznamu (legacy), přidej ji do selectu
  // bez "(mimo aktivní)" suffixu — uživatel chce vidět čistou hodnotu, info že
  // hodnota není aktivní v admin/attributes by ho jen zmátla v běžném používání.
  // Fallback (4 known typy) JEN když fetch už doběhl a vrátil prázdno
  // (DB seed neproběhl). Než fetch doběhne, raději nic — vyhneme se flash
  // hardcoded fallbacku který skryje skutečné AttrOption hodnoty.
  // Žádný fallback hardcoded list — AttrOption je jediný zdroj pravdy.
  // Mid-loading: prázdné options. Po loadu prázdné → empty state.
  const effectiveOptions = loaded ? options : [];
  const hasCurrent = effectiveOptions.some((o) => o.value === value);

  return (
    <div className="inline-flex items-stretch h-9 rounded-md overflow-hidden border w-full" style={{
      borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)`,
      opacity: saving ? 0.5 : 1,
    }}>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 text-[10px] font-mono uppercase tracking-wider flex-shrink-0"
        style={{
          color: meta.color,
          background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        }}
      >
        <Icon name={meta.icon} className="w-3.5 h-3.5" />
      </span>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="bg-card text-sm pl-2 pr-7 border-0 outline-none cursor-pointer focus:bg-muted/40 flex-1 min-w-0"
        style={{ color: meta.color }}
        title="Změnit typ kazety"
      >
        {!hasCurrent && value && (
          <option value={value}>{value}</option>
        )}
        {effectiveOptions.map((o) => (
          <option key={o.id} value={o.value}>{o.value}</option>
        ))}
      </select>
    </div>
  );
}
