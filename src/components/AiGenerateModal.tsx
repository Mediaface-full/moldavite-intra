'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

const DEFAULT_PROMPT = `Jsi zkušený copywriter pro e-shopy s drahými kameny. Na základě těchto parametrů:
- Katalogové číslo: {katalogove_cislo}
- Hmotnost: {hmotnost}
- Místo nálezu: {misto_nalezu}
- Primární aerodynamický tvar: {tvar_cz} ({tvar_en}) — {tvar_popis_cz}

Vytvoř:
1. Krátký název produktu v češtině (max 60 znaků, ideálně zmiň tvar)
2. Krátký název produktu v angličtině (max 60 znaků, mention shape)
3. Poutavý marketingový popis v češtině (cca 3-4 věty, využij tvar)
4. Seznam 3 hlavních výhod v odrážkách v češtině
5. Překlad popisu do profesionální angličtiny (use {tvar_en})
6. Seznam 3 výhod v angličtině

Výstup formátuj POUZE jako JSON (bez dalšího textu) s klíči:
{
  "name_cz": "...",
  "name_en": "...",
  "desc_cz": "...",
  "bullets_cz": ["...", "...", "..."],
  "desc_en": "...",
  "bullets_en": ["...", "...", "..."]
}`;

const TAGS = [
  { tag: '{katalogove_cislo}', label: 'Kat. číslo' },
  { tag: '{hmotnost}', label: 'Hmotnost' },
  { tag: '{misto_nalezu}', label: 'Místo nálezu' },
  { tag: '{cena_czk}', label: 'Cena CZK' },
  { tag: '{cena_eur}', label: 'Cena EUR' },
  { tag: '{cena_usd}', label: 'Cena USD' },
  { tag: '{tvar_cz}', label: 'Tvar CZ' },
  { tag: '{tvar_en}', label: 'Tvar EN' },
  { tag: '{tvar_popis_cz}', label: 'Popis tvaru CZ' },
  { tag: '{tvar_popis_en}', label: 'Popis tvaru EN' },
];

interface AiResult {
  name_cz: string;
  name_en: string;
  desc_cz: string;
  desc_en: string;
  long_desc_cz: string;
  long_desc_en: string;
  catalogNumber: string;
}

interface Props {
  itemId: number;
  catalogNumber: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function AiGenerateModal({ itemId, catalogNumber, onClose, onApplied }: Props) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);

  const insertTag = (tag: string) => {
    setPrompt(prev => prev + ' ' + tag);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, prompt }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setResult(data.result);
      } else {
        setError(data.error || 'Generování selhalo');
        if (data.rawText) {
          setError(prev => prev + '\n\nRaw: ' + data.rawText.substring(0, 300));
        }
      }
    } catch {
      setError('Chyba připojení k API');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      await apiFetch('/api/ai/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          name: result.name_cz,
          nameEn: result.name_en,
          description: result.desc_cz,
          descriptionEn: result.desc_en,
          longDescription: result.long_desc_cz,
          longDescriptionEn: result.long_desc_en,
        }),
      });
      onApplied();
    } catch {
      setError('Nepodařilo se uložit');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 overflow-y-auto py-8">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[color-mix(in_srgb,var(--violet)_15%,transparent)] rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-violet" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold">AI Gemini - Generování textů</h3>
              <p className="text-xs text-muted-foreground">{catalogNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!result ? (
          /* Step 1: Prompt */
          <div className="p-5">
            <label className="block text-xs text-muted-foreground mb-2 uppercase tracking-wider">Prompt pro AI</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={14}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-violet focus:ring-2 focus:ring-[color-mix(in_srgb,var(--violet)_20%,transparent)] resize-y font-mono"
            />

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Vložit tag:</span>
              {TAGS.map(t => (
                <button key={t.tag} onClick={() => insertTag(t.tag)}
                  className="px-2 py-1 rounded text-xs bg-[color-mix(in_srgb,var(--violet)_10%,transparent)] text-violet border border-[color-mix(in_srgb,var(--violet)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--violet)_15%,transparent)] transition-colors">
                  {t.label}
                </button>
              ))}
            </div>

            {error && (
              <pre className="mt-3 text-sm text-destructive bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] rounded-lg px-3 py-2 whitespace-pre-wrap">{error}</pre>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleGenerate} disabled={generating}
                className="flex-1 bg-[var(--violet)] hover:bg-[color-mix(in_srgb,var(--violet)_85%,black)] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <svg className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                {generating ? 'Generuji...' : 'Generovat texty'}
              </button>
              <button onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:border-foreground/40 transition-colors">
                Zrušit
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Preview & Approve */
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* CZ */}
              <div>
                <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-1">
                  <span className="bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary px-2 py-0.5 rounded text-xs">CZ</span>
                  Čeština
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Název</label>
                    <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-border">{result.name_cz}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Krátký popis</label>
                    <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-border">{result.desc_cz}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Dlouhý popis (HTML)</label>
                    <div className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-border prose prose-sm prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: result.long_desc_cz }} />
                  </div>
                </div>
              </div>

              {/* EN */}
              <div>
                <h4 className="text-sm font-semibold text-info mb-3 flex items-center gap-1">
                  <span className="bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-info px-2 py-0.5 rounded text-xs">EN</span>
                  English
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Title</label>
                    <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--info)_30%,transparent)]">{result.name_en}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Short description</label>
                    <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--info)_30%,transparent)]">{result.desc_en}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground uppercase mb-1">Long description (HTML)</label>
                    <div className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--info)_30%,transparent)] prose prose-sm prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: result.long_desc_en }} />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive mb-3">{error}</p>
            )}

            <div className="flex gap-3 border-t border-border pt-4">
              <button onClick={handleApply} disabled={applying}
                className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {applying ? 'Ukládám...' : 'Schválit a uložit'}
              </button>
              <button onClick={() => setResult(null)}
                className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:border-foreground/40 transition-colors">
                Zpět na prompt
              </button>
              <button onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:border-foreground/40 transition-colors">
                Zrušit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
