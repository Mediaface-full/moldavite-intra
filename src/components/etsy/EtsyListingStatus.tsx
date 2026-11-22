'use client';

/** Stav listingu kamene na Etsy (karta Etsy na detailu kamene): aktivní / stažený a proč / chyba / ve frontě. */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface State {
  configured: boolean;
  pending: number;
  listing: { listingId: string | null; state: string; blockedReason: string | null; lastSyncAt: string | null; lastError: string | null } | null;
}

const REASON: Record<string, string> = {
  reservation: 'staženo — kámen je v košíku e-shopu',
  sold: 'staženo — prodáno',
  off: 'staženo — vypnuto',
  ineligible: 'staženo — chybí cena nebo atributy',
};

export default function EtsyListingStatus({ itemId, isAdmin }: { itemId: number; isAdmin: boolean }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    apiFetch(`/api/items/${itemId}/etsy`).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {});
  }, [itemId]);
  useEffect(load, [load]);

  if (!s?.configured) return null;
  const l = s.listing;
  let text = 'na Etsy zatím není';
  let color = 'var(--muted-foreground)';
  if (l?.state === 'error') { text = `chyba: ${l.lastError ?? ''}`; color = 'var(--destructive)'; }
  else if (l?.state === 'active') { text = 'na Etsy aktivní'; color = 'var(--success)'; }
  else if (l?.blockedReason && REASON[l.blockedReason]) { text = REASON[l.blockedReason]; color = 'var(--warning)'; }
  else if (l?.state === 'draft') text = 'rozpracováno (koncept)';

  async function syncNow() {
    setBusy(true);
    await apiFetch('/api/etsy/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: [itemId] }) }).catch(() => {});
    setTimeout(() => { load(); setBusy(false); }, 3000);
  }

  return (
    <p className="text-[10px] font-mono mt-1.5 leading-snug flex items-center gap-2 flex-wrap">
      <span style={{ color }}>{text}</span>
      {s.pending > 0 && <span className="text-muted-foreground">· ve frontě</span>}
      {l?.listingId && <a href={`https://www.etsy.com/listing/${l.listingId}`} target="_blank" rel="noopener noreferrer" className="underline text-text-2 hover:text-foreground">listing ↗</a>}
      {isAdmin && <button type="button" onClick={syncNow} disabled={busy} className="uppercase tracking-wider text-text-2 hover:text-foreground disabled:opacity-50">{busy ? 'propisuji…' : 'propsat teď'}</button>}
    </p>
  );
}
