'use client';

/**
 * VoiceInputButton — Web Speech API → Gemini parse → confirmation modal.
 *
 * Workflow:
 *  1. Klik mic → start recording (cs-CZ)
 *  2. Live transkript v UI
 *  3. Klik Stop → POST /api/items/[id]/voice-parse
 *  4. Modal s checkboxy per pole + textarea pro „doplnit do popisu"
 *  5. User klikne „Použít" → callback `onApply` aplikuje vybraná pole
 *
 * Browser kompatibilita: Chrome/Edge/Safari (desktop + Android). Firefox NE
 * — tlačítko se schová. iOS Safari má limit ~60s na recognition.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

type Suggestions = {
  pasShape?: string;
  attrDamage?: string;
  attrColor?: string[];
  location?: string;
  weight?: number;
  attrCollectible?: boolean;
};

type ParseResponse = {
  suggestions: Suggestions;
  extraNotes?: string;
  unmatched?: string[];
  rawText: string;
};

export type VoiceApplyPayload = {
  fields: Partial<Suggestions>;
  appendToDescription?: string;
};

const FIELD_LABELS: Record<keyof Suggestions, string> = {
  pasShape: 'Tvar',
  attrDamage: 'Poškození',
  attrColor: 'Barva',
  location: 'Místo nálezu',
  weight: 'Hmotnost (g)',
  attrCollectible: 'Sbírkový',
};

// Web Speech API types (DOM types nemají SpeechRecognition na všech setupech)
type SpeechRecognitionResultLike = { [index: number]: { transcript: string } };
type SpeechRecognitionEventLike = {
  results: { [index: number]: SpeechRecognitionResultLike } & { length: number };
  resultIndex: number;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  }
}

export default function VoiceInputButton({
  itemId,
  currentDescription,
  onApply,
}: {
  itemId: number;
  currentDescription: string;
  onApply: (payload: VoiceApplyPayload) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  // Per-pole checkbox state v modalu
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [appendNotes, setAppendNotes] = useState<string>('');
  const [appendEnabled, setAppendEnabled] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Detekce browser support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  const stopRecording = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      recRef.current = null;
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Tvůj prohlížeč nepodporuje hlasový vstup. Zkus Chrome / Edge / Safari.');
      return;
    }
    setError(null);
    setTranscript('');
    setResult(null);

    const rec = new Ctor();
    rec.lang = 'cs-CZ';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0]?.transcript ?? '';
        // SpeechRecognitionResult has .isFinal but TS typings vary
        const isFinal = (e.results[i] as unknown as { isFinal: boolean }).isFinal;
        if (isFinal) final += transcript;
        else interim += transcript;
      }
      setTranscript((prev) => {
        // Append final, replace interim
        const base = prev.replace(/⌛.*$/, '').trim();
        if (final) return (base + ' ' + final).trim();
        return (base + ' ⌛' + interim).trim();
      });
    };
    rec.onerror = (e) => {
      const code = e.error ?? 'unknown';
      // Lidsky popis nejcastejsich chyb — Speech API codes nejsou self-explanatory
      const friendly: Record<string, string> = {
        'not-allowed': 'Prohlížeč zablokoval mikrofon. Klikni vlevo nahoře na ikonu 🔒 / 🔍 → Site settings → Microphone → Allow. Pak obnov stránku a zkus znovu.',
        'service-not-allowed': 'Mikrofon blokován v nastavení prohlížeče. Povol ho pro tuto stránku a obnov.',
        'no-speech': 'Mikrofon nezachytil žádnou řeč. Mluv blíž k mikrofonu a zkus znovu.',
        'audio-capture': 'Mikrofon nenalezen. Zkontroluj že je připojený a vybraný jako vstup v OS.',
        'network': 'Chyba sítě — rozpoznávání běží přes Google. Zkontroluj internet.',
        'aborted': 'Nahrávání zrušeno.',
      };
      setError(friendly[code] ?? `Chyba rozpoznávání (${code}). Zkus prosím znovu nebo restartuj prohlížeč.`);
      stopRecording();
    };
    rec.onend = () => {
      setRecording(false);
      recRef.current = null;
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
  }, [stopRecording]);

  async function parseNow() {
    const clean = transcript.replace(/⌛.*/g, '').trim();
    if (!clean) {
      setError('Žádný text k rozpoznání.');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/items/${itemId}/voice-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data: ParseResponse = await res.json();
      setResult(data);
      // Předvyplň checkboxy: vše navržené je default zaškrtnuté
      const initialPicked: Record<string, boolean> = {};
      for (const k of Object.keys(data.suggestions)) initialPicked[k] = true;
      setPicked(initialPicked);
      setAppendNotes(data.extraNotes ?? '');
      setAppendEnabled(!!data.extraNotes);
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při zpracování');
    } finally {
      setParsing(false);
    }
  }

  function applyPicked() {
    if (!result) return;
    const fields: Partial<Suggestions> = {};
    for (const [key, val] of Object.entries(result.suggestions)) {
      if (picked[key]) {
        (fields as Record<string, unknown>)[key] = val;
      }
    }
    onApply({
      fields,
      appendToDescription: appendEnabled && appendNotes.trim() ? appendNotes.trim() : undefined,
    });
    // Reset
    setShowModal(false);
    setTranscript('');
    setResult(null);
    setError(null);
  }

  function formatValue(key: string, val: unknown): string {
    if (key === 'attrColor' && Array.isArray(val)) return val.join(', ');
    if (key === 'attrCollectible') return val ? 'ano' : 'ne';
    if (key === 'weight') return `${val} g`;
    return String(val);
  }

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className="bg-muted text-muted-foreground/60 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 cursor-not-allowed"
        title="Hlasový vstup nepodporován v tomto prohlížeči — zkus Chrome / Edge / Safari"
      >
        <Icon name="info" className="w-3.5 h-3.5" />
        Mikrofon N/A
      </button>
    );
  }

  return (
    <>
      {!recording && !parsing && !showModal && (
        <button
          type="button"
          onClick={startRecording}
          style={{ background: 'var(--violet)' }}
          className="text-white hover:opacity-90 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity inline-flex items-center gap-1.5"
          title="Nahraj hlasem atributy kamene"
        >
          <Icon name="sparkles" className="w-3.5 h-3.5" />
          Mluv
        </button>
      )}

      {recording && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/15 border border-destructive/30">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-mono text-destructive">Nahrávám…</span>
          <button
            type="button"
            onClick={() => { stopRecording(); setTimeout(parseNow, 100); }}
            className="text-xs font-mono uppercase tracking-wider text-foreground hover:text-primary ml-2"
          >
            Stop & AI
          </button>
        </div>
      )}

      {parsing && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet/15 border border-violet/30">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--violet)' }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-mono" style={{ color: 'var(--violet)' }}>AI parse…</span>
        </div>
      )}

      {/* Transkript prew/po recording — vidiš co AI dostane */}
      {transcript && !showModal && (
        <div className="w-full mt-2 px-3 py-2 rounded-md bg-muted text-xs text-foreground font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
          {transcript.replace(/⌛/g, '… ')}
        </div>
      )}

      {error && (
        <p className="w-full mt-2 text-xs text-destructive font-mono">{error}</p>
      )}

      {/* Confirmation modal */}
      {showModal && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon name="sparkles" className="w-5 h-5" style={{ color: 'var(--violet)' }} />
              <h2 className="text-base font-semibold">AI návrhy z hlasu</h2>
            </div>

            <details className="mb-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Co jsi řekl ({result.rawText.length} znaků)
              </summary>
              <p className="mt-2 px-3 py-2 rounded-md bg-muted font-mono whitespace-pre-wrap">{result.rawText}</p>
            </details>

            {Object.keys(result.suggestions).length === 0 && !result.extraNotes && (
              <p className="text-sm text-muted-foreground">
                AI z přepisu nic nevyextrahovala. Zkus přeformulovat — třeba „tvar kapka, hmotnost tři čtyři gramy, barva zelená".
              </p>
            )}

            {Object.keys(result.suggestions).length > 0 && (
              <div className="mb-4">
                <h3 className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-2">Strukturovaná pole</h3>
                <ul className="space-y-2">
                  {Object.entries(result.suggestions).map(([key, val]) => (
                    <li key={key} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`pick-${key}`}
                        checked={picked[key] ?? false}
                        onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.checked }))}
                        className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-ring/20"
                      />
                      <label htmlFor={`pick-${key}`} className="text-sm cursor-pointer flex-1">
                        <span className="text-muted-foreground">{FIELD_LABELS[key as keyof Suggestions]}:</span>{' '}
                        <span className="font-semibold text-foreground">{formatValue(key, val)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.extraNotes && (
              <div className="mb-4">
                <h3 className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-2">Doplnit do popisu</h3>
                <label className="flex items-start gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={appendEnabled}
                    onChange={(e) => setAppendEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-ring/20"
                  />
                  <span className="text-xs text-muted-foreground">
                    Přidat za stávající popis (delete pro úpravu textu).
                  </span>
                </label>
                <textarea
                  value={appendNotes}
                  onChange={(e) => setAppendNotes(e.target.value)}
                  rows={3}
                  disabled={!appendEnabled}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono disabled:opacity-50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                {currentDescription && appendEnabled && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Stávající popis: „{currentDescription.length > 80 ? currentDescription.slice(0, 80) + '…' : currentDescription}"
                  </p>
                )}
              </div>
            )}

            {result.unmatched && result.unmatched.length > 0 && (
              <div className="mb-4 px-3 py-2 rounded-md bg-warning/10 border border-warning/30">
                <p className="text-[10px] uppercase tracking-wider font-mono text-warning mb-1">Nehodí se do číselníku — neaplikuje se</p>
                <ul className="text-xs space-y-0.5">
                  {result.unmatched.map((u, i) => (
                    <li key={i} className="text-muted-foreground">• {u}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Přidej hodnoty v /admin/attributes a zkus znovu, nebo doplň ručně.
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setTranscript(''); setResult(null); startRecording(); }}
                className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                Nahrát znovu
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={applyPicked}
                  disabled={Object.values(picked).every((v) => !v) && !(appendEnabled && appendNotes.trim())}
                  style={{ background: 'var(--success)' }}
                  className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity"
                >
                  Použít vybrané
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
