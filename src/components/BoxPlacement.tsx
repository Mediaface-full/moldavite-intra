'use client';

import { useState, useRef } from 'react';
import AutocompleteInput from './AutocompleteInput';
import { apiFetch } from '@/lib/apiFetch';

interface BoxPlacementProps {
  boxId: number;
  placement: string;
  /** Když true, nezobrazí inline label "Umístění" (label dodá hostující grid). */
  bare?: boolean;
}

export default function BoxPlacement({ boxId, placement: initial, bare = false }: BoxPlacementProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const prevValue = useRef(initial);

  const handleSave = async () => {
    if (value === prevValue.current) return;
    setSaving(true);

    const propagate = !prevValue.current && value;

    try {
      await apiFetch(`/api/boxes/${boxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement: value, propagatePlacement: propagate }),
      });
      prevValue.current = value;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 w-full">
      {!bare && (
        <label className="text-xs text-muted-foreground uppercase tracking-wider whitespace-nowrap">Umístění</label>
      )}
      <AutocompleteInput
        value={value}
        onChange={setValue}
        onBlur={handleSave}
        field="placement"
        placeholder="Kde je kazeta…"
        className={`bg-card border border-border rounded-md px-3 h-9 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground ${bare ? 'flex-1' : 'w-48'}`}
      />
      {saving && <span className="text-[10px] text-muted-foreground font-mono">…</span>}
      {saved && <span className="text-[10px] text-success font-mono">✓</span>}
    </div>
  );
}
