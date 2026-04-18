'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

export default function ScanNewBoxButton() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResult(`Načteno: ${data.created} nových, ${data.updated} aktualizováno`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResult(`Chyba: ${data.error}`);
      }
    } catch {
      setResult('Chyba při skenování');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-sm text-moldavite-400">{result}</span>
      )}
      <button
        onClick={handleScan}
        disabled={scanning}
        className="bg-moldavite-600 hover:bg-moldavite-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {scanning ? 'Skenuji...' : 'Načíst nové krabice'}
      </button>
    </div>
  );
}
