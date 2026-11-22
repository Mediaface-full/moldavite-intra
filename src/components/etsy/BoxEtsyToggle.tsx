'use client';

/** Kazeta: hromadně zapnout / vypnout „Na Etsy“ u neprodaných kamenů. Kameny bez ceny nebo atributů intra na Etsy nevystaví (zůstanou „staženo — chybí cena“). */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

export default function BoxEtsyToggle({ itemIds, onCount }: { itemIds: number[]; onCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function setAll(onEtsy: boolean) {
    if (!confirm(onEtsy ? `Zapnout „Na Etsy“ u ${itemIds.length} neprodaných kamenů kazety?` : `Vypnout „Na Etsy“ u ${itemIds.length} kamenů kazety? Listingy na Etsy se stáhnou.`)) return;
    setBusy(true);
    const res = await apiFetch('/api/items/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: itemIds.map((id) => ({ id, onEtsy })) }) });
    setBusy(false);
    if (!res.ok) alert('Nepodařilo se uložit');
    router.refresh();
  }
  if (!itemIds.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={busy} onClick={() => setAll(true)}
        style={{ color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)' }}
        className="bg-transparent border px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider disabled:opacity-50 whitespace-nowrap">
        Na Etsy: zapnout vše
      </button>
      {onCount > 0 && (
        <button type="button" disabled={busy} onClick={() => setAll(false)}
          className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50">
          vypnout
        </button>
      )}
    </span>
  );
}
