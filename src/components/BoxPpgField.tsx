'use client';

/**
 * Pole „Cena za gram" pro Box — explicit override + computed display.
 * - Když pole prázdné → fallback řetězec (calculate.ts): Box.amount/weight → Order PPG
 * - Hint pod inputem ukáže computed PPG z purchaseAmountCzk/declaredWeight pokud existuje
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

export default function BoxPpgField({
  boxId,
  initial,
  computedFrom,
  orderInherited,
  orderInheritedSource,
}: {
  boxId: number;
  initial: string | null;
  computedFrom: string | null;
  /** PPG zdedene ze zakazky (default nebo dopocet) — fallback kdyz Box nema vlastni data. */
  orderInherited?: string | null;
  /** „default" | „compute" — pro hint text */
  orderInheritedSource?: 'default' | 'compute' | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lastSaved = useRef(initial ?? '');

  useEffect(() => {
    const next = initial ?? '';
    lastSaved.current = next;
    setValue((cur) => (cur === '' || cur === lastSaved.current ? next : cur));
  }, [initial]);

  async function save() {
    if (value === lastSaved.current) return;
    setSaving(true);
    const payload = value.trim() === '' ? null : Number(value);
    if (payload !== null && !Number.isFinite(payload)) { setSaving(false); return; }

    const res = await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchasePricePerGramCzk: payload }),
    });
    setSaving(false);
    if (res.ok) {
      lastSaved.current = value;
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      router.refresh();
    } else {
      setValue(lastSaved.current);
    }
  }

  const isOverride = value.trim() !== '';
  // Placeholder priorita: 1) box-level compute (cena/váha) 2) order-level inherited 3) —
  const placeholder = computedFrom
    ? `auto: ${computedFrom}`
    : orderInherited
      ? `${orderInherited} (ze zakázky)`
      : '—';

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min={0}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="flex-1 min-w-0 bg-card border border-border rounded-md px-3 h-9 text-sm text-foreground font-mono focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">Kč/g</span>
        {saving && <span className="text-[10px] text-muted-foreground font-mono">…</span>}
        {saved && <span className="text-[10px] text-success font-mono">✓</span>}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {isOverride ? (
          <>Override: {value} Kč/g se použije pro všechny kameny v této kazetě.</>
        ) : computedFrom ? (
          <>Vypočítáno z nákupu/váhy kazety: <span className="text-foreground">{computedFrom} Kč/g</span>. Necháš-li prázdné, použije se tato hodnota.</>
        ) : orderInherited ? (
          <>Zděděno ze zakázky ({orderInheritedSource === 'compute' ? 'dopočet z celku' : 'default'}): <span className="text-foreground">{orderInherited} Kč/g</span>. Necháš-li prázdné, použije se tato hodnota.</>
        ) : (
          <>Necháš-li prázdné, použije se hodnota ze zakázky (Order default).</>
        )}
      </p>
    </div>
  );
}
