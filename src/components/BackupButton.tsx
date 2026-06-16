'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

export default function BackupButton() {
  const [backing, setBacking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleBackup = async () => {
    setBacking(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/admin/backup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResult(`Záloha vytvořena: ${data.filename} (${data.size})`);
      } else {
        const detail = data.detail ? ` — ${data.detail}` : '';
        const hint = data.hint ? `  ▸ ${data.hint}` : '';
        setResult(`Chyba: ${data.error}${detail}${hint}`);
      }
    } catch (err) {
      setResult(`Chyba připojení: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBacking(false);
      // Chyby si necháme dlouho (uživatel potřebuje detail přečíst), úspěch zmizí brzy
      setTimeout(() => setResult((r) => (r && r.startsWith('Chyba') ? r : null)), 5000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleBackup}
        disabled={backing}
        className="bg-muted border border-border hover:border-ring text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        <svg className={`w-4 h-4 ${backing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
        {backing ? 'Zálohuji...' : 'Zálohovat systém'}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith('Chyba') ? 'text-destructive' : 'text-primary'} max-w-2xl break-words`}>
          {result}
        </span>
      )}
    </div>
  );
}
