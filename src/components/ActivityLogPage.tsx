'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface LogEntry {
  id: number;
  action: string;
  target: string;
  details: string;
  createdAt: string;
  user: { email: string; name: string | null };
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'auth.login': { label: 'Přihlášení', color: 'text-blue-400' },
  'item.update': { label: 'Úprava kamene', color: 'text-moldavite-400' },
  'item.bulk_update': { label: 'Hromadná úprava', color: 'text-moldavite-400' },
  'item.delete': { label: 'Smazání kamene', color: 'text-red-400' },
  'item.sold': { label: 'Prodej', color: 'text-red-400' },
  'box.placement': { label: 'Umístění krabice', color: 'text-yellow-400' },
  'box.photos': { label: 'Fotky krabice', color: 'text-yellow-400' },
  'admin.user.create': { label: 'Nový uživatel', color: 'text-green-400' },
  'admin.user.update': { label: 'Úprava uživatele', color: 'text-yellow-400' },
  'admin.user.delete': { label: 'Smazání uživatele', color: 'text-red-400' },
  'admin.backup': { label: 'Záloha DB', color: 'text-cyan-400' },
  'export.upgates': { label: 'Export Upgates', color: 'text-moldavite-300' },
  'export.etsy': { label: 'Export Etsy', color: 'text-orange-400' },
  'rates.fetch': { label: 'Kurzy ČNB', color: 'text-blue-300' },
  'rates.recalc': { label: 'Přepočet cen', color: 'text-blue-300' },
  'scan': { label: 'Sken fotek', color: 'text-yellow-300' },
  'ai.generate': { label: 'AI generování', color: 'text-purple-400' },
  'ai.apply': { label: 'AI texty uloženy', color: 'text-purple-300' },
  'certificate.generate': { label: 'Certifikát', color: 'text-cyan-300' },
};

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
  { value: 'box', label: 'Krabice' },
];

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 50;

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (actionFilter) params.set('action', actionFilter);
      const res = await apiFetch(`/api/admin/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    })();
  }, [page, actionFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-text-secondary mt-1">Přehled aktivit v systému ({total} záznamů)</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="bg-bg-secondary border border-border-color rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-moldavite-500"
          >
            {ACTION_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <CleanupButton onDone={() => { setPage(0); setActionFilter(''); }} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-secondary border-b border-border-color">
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Čas</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Uživatel</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Akce</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Cíl</th>
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'text-text-secondary' };
              return (
                <tr key={log.id} className="border-b border-border-color hover:bg-bg-card-hover transition-colors">
                  <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-text-primary text-xs">
                    {log.user.name || log.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                    {log.target || '-'}
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs max-w-xs truncate">
                    {log.details || '-'}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
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
          <p className="text-sm text-text-muted">
            Strana {page + 1} z {Math.ceil(total / limit)}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-bg-secondary border border-border-color text-text-secondary disabled:opacity-50 hover:border-border-hover transition-colors">
              Předchozí
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}
              className="px-3 py-1.5 rounded-lg text-sm bg-bg-secondary border border-border-color text-text-secondary disabled:opacity-50 hover:border-border-hover transition-colors">
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
      className="text-xs text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
      title="Smazat záznamy starší než 1 rok">
      {cleaning ? '...' : 'Vyčistit log'}
    </button>
  );
}
