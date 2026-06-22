'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';
import { actionMeta, describeDetails, friendlyTarget } from '@/lib/activity-format';

interface LogEntry {
  id: number;
  action: string;
  target: string;
  targetDisplay?: string;
  details: string;
  createdAt: string;
  user: { email: string; name: string | null };
}

const ACTION_FILTERS = [
  { value: '', label: 'Všechny akce' },
  { value: 'auth.login', label: 'Přihlášení' },
  { value: 'item.update', label: 'Úpravy kamenů' },
  { value: 'item.bulk_update', label: 'Hromadné úpravy' },
  { value: 'export.upgates', label: 'Export Upgates' },
  { value: 'export.etsy', label: 'Export Etsy' },
  { value: 'admin.backup', label: 'Zálohy' },
  { value: 'admin.user', label: 'Správa uživatelů' },
  { value: 'rates', label: 'Kurzy a přepočty' },
  { value: 'ai', label: 'AI generování' },
  { value: 'certificate', label: 'Certifikáty' },
  { value: 'scan', label: 'Sken fotek' },
  { value: 'box', label: 'Kazety' },
];

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [itemCodeQuery, setItemCodeQuery] = useState('');
  const [notFound, setNotFound] = useState<string | null>(null);
  const limit = 50;

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (actionFilter) params.set('action', actionFilter);
      if (itemCodeQuery) params.set('itemCode', itemCodeQuery);
      const res = await apiFetch(`/api/admin/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
        setNotFound(data.notFound ?? null);
      }
    })();
  }, [page, actionFilter, itemCodeQuery]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground mt-1">Přehled aktivit v systému ({total} záznamů)</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Hledání podle kódu kamene / kazety */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setItemCodeQuery(itemCodeInput.trim());
            }}
            className="inline-flex items-center gap-1.5"
          >
            <input
              type="text"
              value={itemCodeInput}
              onChange={(e) => setItemCodeInput(e.target.value)}
              placeholder="K0001-0005 nebo K0001"
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono w-44 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors"
              title="Hledat logy kamene / kazety"
            >
              Hledat
            </button>
            {itemCodeQuery && (
              <button
                type="button"
                onClick={() => { setItemCodeInput(''); setItemCodeQuery(''); setPage(0); }}
                className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground px-2 py-1"
                title="Zrušit filtr"
              >
                ✕
              </button>
            )}
          </form>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            {ACTION_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <CleanupButton onDone={() => { setPage(0); setActionFilter(''); setItemCodeInput(''); setItemCodeQuery(''); }} />
        </div>
      </div>

      {notFound && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          {notFound}
        </div>
      )}

      {itemCodeQuery && !notFound && (
        <div className="mb-4 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm inline-flex items-center gap-2">
          <span className="text-muted-foreground">Filtr:</span>
          <span className="font-mono font-semibold">{itemCodeQuery}</span>
          <span className="text-muted-foreground">({total} záznamů)</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Čas</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Uživatel</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Akce</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cíl</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const meta = actionMeta(log.action);
              const human = describeDetails(log.action, log.details);
              const target = log.targetDisplay || friendlyTarget(log.action, log.target);
              const isItem = log.action.startsWith('item.');
              return (
                <tr key={log.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-foreground text-xs">
                    {log.user.name || log.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                      <Icon name={meta.icon} className="w-3.5 h-3.5" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {target ? (
                      isItem ? (
                        <Link href={`/items/${log.target}`} className="font-mono text-primary hover:underline">
                          {target}
                        </Link>
                      ) : (
                        <span className="font-mono text-muted-foreground">{target}</span>
                      )
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-md truncate" title={log.details || undefined}>
                    {human || '—'}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Žádné záznamy
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Strana {page + 1} z {Math.ceil(total / limit)}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-muted border border-border text-muted-foreground disabled:opacity-50 hover:border-foreground/40 transition-colors">
              Předchozí
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}
              className="px-3 py-1.5 rounded-lg text-sm bg-muted border border-border text-muted-foreground disabled:opacity-50 hover:border-foreground/40 transition-colors">
              Další
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CleanupButton({ onDone }: { onDone: () => void }) {
  const [cleaning, setCleaning] = useState(false);

  const handleCleanup = async () => {
    if (!confirm('Smazat záznamy starší než 1 rok?')) return;
    setCleaning(true);
    try {
      const res = await apiFetch('/api/admin/logs/cleanup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Smazáno ${data.deleted} starých záznamů`);
        onDone();
        window.location.reload();
      }
    } catch {} finally { setCleaning(false); }
  };

  return (
    <button onClick={handleCleanup} disabled={cleaning}
      className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      title="Smazat záznamy starší než 1 rok">
      {cleaning ? '...' : 'Vyčistit log'}
    </button>
  );
}
