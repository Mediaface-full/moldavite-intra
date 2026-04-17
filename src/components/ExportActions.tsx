'use client';

import { useState } from 'react';

export default function ExportActions({ type }: { type: 'eshop' | 'etsy' | 'scan' }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  if (type === 'eshop') {
    return (
      <button
        onClick={() => window.open('/api/export', '_blank')}
        className="w-full bg-moldavite-600 hover:bg-moldavite-500 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Stáhnout Upgates XML
      </button>
    );
  }

  if (type === 'etsy') {
    return (
      <button
        onClick={() => window.open('/api/export/etsy', '_blank')}
        className="w-full bg-orange-600 hover:bg-orange-500 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Stáhnout Etsy CSV
      </button>
    );
  }

  // Scan type
  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setScanResult(`Hotovo! Vytvořeno: ${data.created}, aktualizováno: ${data.updated}`);
      } else {
        setScanResult(`Chyba: ${data.error}`);
      }
    } catch {
      setScanResult('Chyba při skenování');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleScan}
        disabled={scanning}
        className="w-full bg-bg-secondary border border-border-color hover:border-border-hover text-text-primary px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {scanning ? 'Skenuji...' : 'Skenovat FOTO_MOLDAVITE (načíst nové krabice/kameny)'}
      </button>
      {scanResult && (
        <p className="text-sm text-moldavite-400 bg-moldavite-950 border border-moldavite-800 rounded-lg px-4 py-2">
          {scanResult}
        </p>
      )}
    </div>
  );
}
