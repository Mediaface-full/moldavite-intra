'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

const AVAILABLE_CURRENCIES = ['CZK', 'EUR', 'USD'];

interface ExportCardProps {
  type: 'upgates' | 'etsy';
  title: string;
  subtitle: string;
  color: 'moldavite' | 'orange';
  totalCount: number;
  activeCount: number;
  activeLabel: string;
  config: {
    currencies: string[];
    primaryCurrency: string;
    commission: number;
    roundPrices: boolean;
    languages: string[];
    primaryLanguage: string;
  };
}

export default function ExportCard({
  type, title, subtitle, color, totalCount, activeCount, activeLabel, config: initialConfig,
}: ExportCardProps) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/export-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportType: type, ...config }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCurrency = (currency: string) => {
    setConfig(prev => {
      const has = prev.currencies.includes(currency);
      let currencies: string[];
      if (has) {
        currencies = prev.currencies.filter(c => c !== currency);
        if (currencies.length === 0) currencies = ['CZK'];
      } else {
        currencies = [...prev.currencies, currency];
      }
      const primaryCurrency = currencies.includes(prev.primaryCurrency) ? prev.primaryCurrency : currencies[0];
      return { ...prev, currencies, primaryCurrency };
    });
  };

  const btnColor = color === 'moldavite'
    ? 'bg-primary hover:bg-primary/90'
    : 'bg-warning hover:bg-warning';

  const accentColor = color === 'moldavite' ? 'text-primary' : 'text-warning';

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          color === 'moldavite' ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]'
        }`}>
          <svg className={`w-5 h-5 ${accentColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1.5 mb-5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Kameny celkem</span>
          <span className="font-semibold">{totalCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{activeLabel}</span>
          <span className={`font-semibold ${accentColor}`}>{activeCount}</span>
        </div>
      </div>

      {/* Currency settings */}
      <div className="border-t border-border pt-4 mb-4">
        <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Měny v exportu</h4>
        <div className="flex gap-2 mb-3">
          {AVAILABLE_CURRENCIES.map(currency => (
            <button
              key={currency}
              onClick={() => toggleCurrency(currency)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                config.currencies.includes(currency)
                  ? color === 'moldavite'
                    ? 'bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] border-primary/60 text-primary'
                    : 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border-warning text-warning'
                  : 'bg-muted border-border text-muted-foreground'
              }`}
            >
              {currency}
            </button>
          ))}
        </div>

        {/* Primary currency */}
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Hlavní měna</label>
          <select
            value={config.primaryCurrency}
            onChange={(e) => setConfig(prev => ({ ...prev, primaryCurrency: e.target.value }))}
            className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            {config.currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Commission */}
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Provize</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={config.commission}
              onChange={(e) => setConfig(prev => ({ ...prev, commission: parseFloat(e.target.value) || 0 }))}
              className="w-20 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground text-right focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        {/* Round prices */}
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Zaokrouhlit ceny</label>
          <button
            onClick={() => setConfig(prev => ({ ...prev, roundPrices: !prev.roundPrices }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.roundPrices ? (color === 'moldavite' ? 'bg-primary' : 'bg-warning') : 'bg-muted'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.roundPrices ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Languages */}
        <div className="border-t border-border pt-3 mb-4">
          <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Jazyk obsahu</h4>
          <div className="flex gap-2 mb-2">
            {['cz', 'en'].map(l => (
              <button key={l} onClick={() => {
                setConfig(prev => {
                  const has = prev.languages.includes(l);
                  let languages = has ? prev.languages.filter(x => x !== l) : [...prev.languages, l];
                  if (languages.length === 0) languages = ['cz'];
                  const primaryLanguage = languages.includes(prev.primaryLanguage) ? prev.primaryLanguage : languages[0];
                  return { ...prev, languages, primaryLanguage };
                });
              }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  config.languages.includes(l)
                    ? l === 'cz'
                      ? 'bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] border-primary/60 text-primary'
                      : 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] border-info text-info'
                    : 'bg-muted border-border text-muted-foreground'
                }`}>
                {l === 'cz' ? 'Čeština' : 'English'}
              </button>
            ))}
          </div>
          {config.languages.length > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Hlavní jazyk</label>
              <select value={config.primaryLanguage}
                onChange={(e) => setConfig(prev => ({ ...prev, primaryLanguage: e.target.value }))}
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
                {config.languages.map(l => (
                  <option key={l} value={l}>{l === 'cz' ? 'Čeština' : 'English'}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Save + Recalc buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {saving ? 'Ukládám...' : saved ? 'Uloženo!' : 'Uložit nastavení'}
          </button>
        </div>
      </div>

      {/* Recalc button */}
      <RecalcButton />

      {/* Download button */}
      <button
        onClick={() => window.open(type === 'upgates' ? '/api/export' : '/api/export/etsy', '_blank')}
        className={`w-full ${btnColor} text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-3`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Stáhnout {type === 'upgates' ? 'Upgates XML' : 'Etsy CSV'}
      </button>
    </div>
  );
}

function RecalcButton() {
  const [recalcing, setRecalcing] = useState(false);
  const [result, setResult] = useState('');

  const handleRecalc = async () => {
    setRecalcing(true);
    setResult('');
    try {
      const res = await apiFetch('/api/rates/recalc', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResult(`Přepočteno ${data.recalculated} kamenů`);
        setTimeout(() => setResult(''), 3000);
      }
    } catch {
      setResult('Chyba');
    } finally {
      setRecalcing(false);
    }
  };

  return (
    <div className="mb-3">
      <button
        onClick={handleRecalc}
        disabled={recalcing}
        className="w-full bg-muted border border-border hover:border-foreground/40 text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg className={`w-4 h-4 ${recalcing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {recalcing ? 'Přepočítávám...' : 'Přepočítat ceny podle kurzu'}
      </button>
      {result && (
        <p className="text-xs text-primary mt-1 text-center">{result}</p>
      )}
    </div>
  );
}
