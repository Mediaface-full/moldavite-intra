'use client';

/**
 * OrderLogsTab — lidsky čitelný výpis aktivit nad zakázkou.
 *
 * Backend (/api/orders/[id]/logs) vrací posledních 200 záznamů z ActivityLog
 * filtrovaných na zakázku + její kazety + kameny. Tady je převedeme do
 * čitelné podoby: ikonu podle akce, lokalizovaný popis akce, target jako
 * katalogové číslo/kód, a vyextrahované klíčové pole z JSON details.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import { apiFetch } from '@/lib/apiFetch';
import { actionMeta, describeDetails } from '@/lib/activity-format';

type LogEntry = {
  id: number;
  action: string;
  target: string;
  details: string;
  createdAt: string;
  user: { email: string; name: string | null } | null;
  targetDisplay: string;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function OrderLogsTab({ orderId }: { orderId: number }) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/orders/${orderId}/logs`);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs ?? []);
        } else {
          setError(`HTTP ${res.status}`);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Chyba');
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
        <p className="text-destructive font-mono text-sm">Chyba načítání logů: {error}</p>
      </div>
    );
  }

  if (logs === null) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">Načítám…</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
        <p className="text-muted-foreground mb-2">Žádné záznamy v aktivitním logu pro tuto zakázku.</p>
        <p className="text-xs text-muted-foreground font-mono">
          Logy se zaznamenají při úpravách zakázky, kazet, kamenů, nákladů nebo přepočtu.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="history" className="w-4 h-4" />
          Aktivitní log ({logs.length})
        </h3>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          posledních 200 záznamů
        </span>
      </div>
      <ul className="divide-y divide-border">
        {logs.map((l) => {
          const meta = actionMeta(l.action);
          const human = describeDetails(l.action, l.details);
          const isItem = l.action.startsWith('item.');
          const itemHref = isItem ? `/items/${l.target}` : null;
          return (
            <li key={l.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
              <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 mt-0.5"
                  style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  }}
                >
                  <Icon name={meta.icon} className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{meta.label}</span>
                    {l.targetDisplay && (
                      itemHref ? (
                        <Link
                          href={itemHref}
                          className="font-mono text-xs text-primary hover:underline"
                          title="Otevřít kámen"
                        >
                          {l.targetDisplay}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{l.targetDisplay}</span>
                      )
                    )}
                  </div>
                  {human && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{human}</p>
                  )}
                </div>
                <div className="text-right text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                  <p>{fmtDate(l.createdAt)}</p>
                  {l.user && (
                    <p className="mt-0.5">{l.user.name || l.user.email}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
