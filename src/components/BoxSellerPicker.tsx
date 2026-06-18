'use client';

/**
 * Wrapper kolem SellerPicker — řeší auto-save přes PATCH /api/boxes/:id
 * a inline status indikátor (Uloženo / ...).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import SellerPicker from './SellerPicker';

export default function BoxSellerPicker({ boxId, initial, bare = false }: { boxId: number; initial: number | null; bare?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleChange(id: number | null) {
    setValue(id);
    setSaving(true);
    await apiFetch(`/api/boxes/${boxId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId: id }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 w-full">
      {!bare && (
        <label className="text-xs text-muted-foreground uppercase tracking-wider whitespace-nowrap">Dodavatel</label>
      )}
      <div className={bare ? 'flex-1 min-w-0' : 'w-56'}>
        <SellerPicker value={value} onChange={handleChange} />
      </div>
      {saving && <span className="text-[10px] text-muted-foreground font-mono">…</span>}
      {saved && <span className="text-[10px] text-success font-mono">✓</span>}
    </div>
  );
}
