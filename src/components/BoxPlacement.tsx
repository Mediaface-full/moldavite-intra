'use client';

import { useState, useRef } from 'react';
import AutocompleteInput from './AutocompleteInput';

interface BoxPlacementProps {
  boxId: number;
  placement: string;
}

export default function BoxPlacement({ boxId, placement: initial }: BoxPlacementProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const prevValue = useRef(initial);

  const handleSave = async () => {
    if (value === prevValue.current) return;
    setSaving(true);

    const propagate = !prevValue.current && value;

    try {
      await fetch(`/api/boxes/${boxId}`, {
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
    <div className="flex items-center gap-2">
      <label className="text-xs text-text-muted uppercase tracking-wider whitespace-nowrap">Umístění</label>
      <AutocompleteInput
        value={value}
        onChange={setValue}
        onBlur={handleSave}
        field="placement"
        placeholder="Kde je krabice..."
        className="bg-bg-secondary border border-border-color rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-moldavite-500 placeholder-text-muted w-48"
      />
      {saving && <span className="text-xs text-text-muted">...</span>}
      {saved && <span className="text-xs text-moldavite-400">Uloženo</span>}
    </div>
  );
}
