'use client';

/**
 * Univerzální auto-save input pro libovolné Box pole.
 * - Typ "number" posílá Number(value) (nebo null pro prázdnou hodnotu)
 * - Typ "text" posílá string
 * - Save trigger: onBlur + Enter; status indikátor (… / ✓)
 * - Žádný refresh stránky — UI změny jsou auto-saved on blur
 */
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

export default function BoxFieldInput({
  boxId,
  field,
  initial,
  type = 'number',
  placeholder,
  step,
  min = 0,
  max,
  suffix,
  inheritedHint,
  inheritedHintTitle,
}: {
  boxId: number;
  field: string;
  initial: string | number | null | undefined;
  type?: 'number' | 'text';
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
  suffix?: string;
  /** Zdedena hodnota co se ukaze v poli jako tlumeny placeholder kdyz user nic nezadal. */
  inheritedHint?: string | null;
  /** Tooltip k inherited placeholder vysvětluje odkud hodnota pochází. */
  inheritedHintTitle?: string;
}) {
  const router = useRouter();
  // Treat numeric 0 as „nezadáno" — zobrazí se inherited placeholder místo zavádějícího „0".
  // Pro type='number' s min=0 nikdy nedává smysl uchovávat „0" jako reálnou hodnotu
  // (nula nákupní ceny / nula váhy = chybí data). Pro type='text' 0 nepřichází.
  const initialDisplay = (type === 'number' && (initial === 0 || initial === '0'))
    ? ''
    : (initial == null ? '' : String(initial));
  const [value, setValue] = useState<string>(initialDisplay);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lastSaved = useRef<string>(initialDisplay);

  // Sync s parent re-render (router.refresh přinese nový initial z DB).
  // Bez tohoto by lastSaved ref držel starou hodnotu a další save by mohl
  // re-uložit hodnotu kterou jsme již uložili → spam PATCH requests / rollback bug.
  useEffect(() => {
    const next = (type === 'number' && (initial === 0 || initial === '0'))
      ? ''
      : (initial == null ? '' : String(initial));
    lastSaved.current = next;
    setValue((cur) => (cur === '' || cur === lastSaved.current ? next : cur));
  }, [initial, type]);

  async function save() {
    if (value === lastSaved.current) return;
    setSaving(true);
    let payload: unknown;
    if (type === 'number') {
      if (value.trim() === '') {
        payload = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n)) { setSaving(false); return; }
        payload = n;
      }
    } else {
      payload = value;
    }
    const res = await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: payload }),
    });
    setSaving(false);
    if (res.ok) {
      lastSaved.current = value;
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      router.refresh();
    } else {
      // Roll back na poslední úspěšnou hodnotu
      setValue(lastSaved.current);
    }
  }

  // Pokud user nezadal nic a mame inheritedHint, ukaz ho jako placeholder
  // (sedy text v poli). Vlastni `placeholder` prop ma prednost.
  const effectivePlaceholder = (placeholder !== undefined && placeholder !== '—' && placeholder !== '')
    ? placeholder
    : (inheritedHint ?? '—');

  return (
    <div className="flex items-center gap-2 w-full">
      <input
        type={type}
        value={value}
        step={step}
        min={type === 'number' ? min : undefined}
        max={max}
        placeholder={effectivePlaceholder}
        title={value === '' && inheritedHint ? (inheritedHintTitle ?? 'Zděděno ze zakázky') : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 bg-card border border-border rounded-md px-3 h-9 text-sm text-foreground font-mono focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
      {suffix && (
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">{suffix}</span>
      )}
      {saving && <span className="text-[10px] text-muted-foreground font-mono">…</span>}
      {saved && <span className="text-[10px] text-success font-mono">✓</span>}
    </div>
  );
}
