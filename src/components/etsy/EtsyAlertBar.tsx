'use client';

/** Červená lišta pro admina: kámen prodaný dvakrát nebo odpojený obchod na Etsy. Zmizí po vyřešení v Administraci → Etsy. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

interface Alerts { conflicts: Array<{ id: number; conflictNote: string | null; receiptId: string }>; disconnected: string | null }

export default function EtsyAlertBar() {
  const pathname = usePathname();
  const [a, setA] = useState<Alerts | null>(null);
  useEffect(() => {
    apiFetch('/api/etsy/alerts').then((r) => (r.ok ? r.json() : null)).then(setA).catch(() => {});
  }, [pathname]);
  if (!a || (!a.conflicts.length && !a.disconnected)) return null;
  return (
    <div className="mb-4 rounded-lg px-4 py-2.5 text-sm text-white flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--destructive)' }}>
      <span>
        {a.conflicts.length > 0
          ? `Etsy: ${a.conflicts.length === 1 ? a.conflicts[0].conflictNote ?? 'kámen prodaný dvakrát' : `${a.conflicts.length} kameny prodané dvakrát`} — jednu objednávku zruš.`
          : 'Etsy: obchod je odpojený, nic se nepropisuje — připoj ho znovu.'}
      </span>
      <Link href="/admin/etsy" className="underline underline-offset-2 font-medium whitespace-nowrap">Otevřít Etsy →</Link>
    </div>
  );
}
