'use client';

/**
 * Inline-editable jméno kazety pod hlavičkou (box.code).
 * - Klik na text → edit mode (input)
 * - Enter / blur → save
 * - Escape → cancel
 * - Prázdná hodnota = placeholder „+ přidat popisek"
 */
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

export default function BoxNameInline({ boxId, initial }: { boxId: number; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(initial); }, [initial]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    const res = await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft }),
    });
    setSaving(false);
    if (res.ok) {
      setValue(draft);
      router.refresh();
    } else {
      setDraft(value);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        placeholder="Popisek / poznámka…"
        className="mt-1 bg-card border border-border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 w-full max-w-md"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="mt-1 text-sm text-left hover:text-foreground transition-colors group inline-flex items-center gap-1.5"
      title={value ? 'Klikni pro úpravu' : 'Klikni pro přidání popisku'}
    >
      <span className={value ? 'text-muted-foreground' : 'text-muted-foreground/60 italic'}>
        {value || '+ přidat popisek'}
      </span>
      {saving && <span className="text-[10px] text-muted-foreground font-mono">…</span>}
    </button>
  );
}
