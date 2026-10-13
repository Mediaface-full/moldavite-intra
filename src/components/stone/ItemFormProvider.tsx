'use client';

/**
 * Sdílený stav formuláře kamene pro všechny sekce redesignovaného detailu
 * (docs/REDESIGN-DETAIL-KAMENE.md §7). Logika autosave, resync po serveru,
 * reviewMode a lokální raw stav hmotnosti je PŘENESENÁ 1:1 z původního
 * ItemDetailForm.tsx — jen vytažená do contextu, aby ji mohly sdílet
 * hlavička, souhrn, checklist a sekce.
 *
 * Pasti (viz memory client_state_resync_pattern):
 *  - autosave 800 ms po změně formData; první mount a resync ze serveru
 *    se přeskakují přes skipNextAutoSave
 *  - hmotnost má lokální raw text, do formData se commituje až na blur
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { parseDecimalCs } from '@/lib/utils';
import type { VoiceApplyPayload } from '../VoiceInputButton';
import type { ItemData, ItemFormData } from './types';

function fromItem(item: ItemData): ItemFormData {
  return {
    name: item.name,
    nameEn: item.nameEn,
    description: item.description,
    descriptionEn: item.descriptionEn,
    longDescription: item.longDescription,
    longDescriptionEn: item.longDescriptionEn,
    location: item.location,
    storage: item.storage,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    weight: item.weight,
    sold: item.sold,
    onShop: item.onShop,
    onEtsy: item.onEtsy,
    pasShape: item.pasShape || '',
    attrDamage: item.attrDamage || '',
    attrColor: item.attrColor || [],
    attrCollectible: item.attrCollectible || false,
    manualPriceInclVatCzk: item.manualPriceInclVatCzk ?? '',
    purchasePricePerGramCzk: item.purchasePricePerGramCzk ?? '',
    voiceNotes: item.voiceNotes ?? '',
  };
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ItemFormContextValue {
  item: ItemData;
  formData: ItemFormData;
  setField: <K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => void;
  patch: (partial: Partial<ItemFormData>) => void;
  saveState: SaveState;
  saveNow: () => Promise<void>;
  catalogNumber: string;
  reviewMode: boolean;
  missingHighlight: { pasShape: boolean; attrDamage: boolean; attrColor: boolean; location: boolean; weight: boolean };
  publishBlocked: boolean;
  blockedTitle: string | undefined;
  vatRate: number;
  /** ADMIN smí zadat speciální cenu pod doporučenou (13. 10. 2026) */
  isAdmin: boolean;
  weightRaw: string;
  setWeightRaw: (v: string) => void;
  commitWeight: () => void;
  applyVoice: (payload: VoiceApplyPayload) => void;
}

const Ctx = createContext<ItemFormContextValue | null>(null);

export function useItemForm(): ItemFormContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useItemForm musí být uvnitř <ItemFormProvider>');
  return v;
}

export default function ItemFormProvider({ item, isAdmin = false, children }: { item: ItemData; isAdmin?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [formData, setFormData] = useState<ItemFormData>(() => fromItem(item));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savedTimer = useRef<NodeJS.Timeout | null>(null);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      const res = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          nameEn: formData.nameEn,
          description: formData.description,
          descriptionEn: formData.descriptionEn,
          longDescription: formData.longDescription,
          longDescriptionEn: formData.longDescriptionEn,
          location: formData.location,
          storage: formData.storage,
          purchasePrice: parseFloat(formData.purchasePrice) || 0,
          salePrice: parseFloat(formData.salePrice) || 0,
          weight: parseFloat(formData.weight) || 0,
          sold: formData.sold,
          onShop: formData.onShop,
          onEtsy: formData.onEtsy,
          pasShape: formData.pasShape,
          attrDamage: formData.attrDamage,
          attrColor: formData.attrColor,
          attrCollectible: formData.attrCollectible,
          manualPriceInclVatCzk: formData.manualPriceInclVatCzk === '' ? null : Number(formData.manualPriceInclVatCzk),
          purchasePricePerGramCzk: formData.purchasePricePerGramCzk === '' ? null : Number(formData.purchasePricePerGramCzk),
          voiceNotes: formData.voiceNotes,
        }),
      });
      if (res.ok) {
        setSaveState('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState('idle'), 2500);
        // Server po PATCH spustil order recalc → fresh data (recommended, breakdown, status).
        router.refresh();
      } else {
        setSaveState('error');
        const data = await res.json().catch(() => ({}));
        console.error('Failed to save:', res.status, data?.error);
        if (data?.error) alert(`Uložení selhalo: ${data.error}`);
      }
    } catch (err) {
      setSaveState('error');
      console.error('Failed to save:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, item.id]);

  // Autosave — 800 ms po poslední změně; skip initial mount + resync ze serveru.
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const skipNextAutoSave = useRef(true);
  useEffect(() => {
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { handleSave(); }, 800);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Resync formData z fresh `item` (po router.refresh) — změna přišla ze serveru, ne od uživatele.
  useEffect(() => {
    skipNextAutoSave.current = true;
    setFormData(fromItem(item));
  }, [item]);

  const setField = useCallback(<K extends keyof ItemFormData>(key: K, value: ItemFormData[K]) => {
    setFormData((f) => (f[key] === value ? f : { ...f, [key]: value }));
  }, []);
  const patch = useCallback((partial: Partial<ItemFormData>) => {
    setFormData((f) => ({ ...f, ...partial }));
  }, []);

  // Hmotnost — lokální raw text, commit na blur (pattern z původního formuláře).
  const [weightRaw, setWeightRaw] = useState<string>(formData.weight ?? '');
  useEffect(() => {
    const parsedRaw = parseDecimalCs(weightRaw);
    const expected = parseDecimalCs(formData.weight);
    if (Number.isFinite(parsedRaw) && Number.isFinite(expected) && Math.abs(parsedRaw - expected) < 0.005) return;
    if (!Number.isFinite(parsedRaw) && !Number.isFinite(expected)) return;
    setWeightRaw(formData.weight ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.weight]);
  const commitWeight = useCallback(() => {
    const raw = weightRaw.trim();
    if (raw === '') {
      if (formData.weight !== '' && formData.weight !== '0') setField('weight', '');
      return;
    }
    const n = parseDecimalCs(raw);
    if (!Number.isFinite(n) || n < 0) {
      setWeightRaw(formData.weight ?? '');
      return;
    }
    const formatted = n.toFixed(2);
    if (formatted !== formData.weight) setField('weight', formatted);
    if (formatted !== weightRaw) setWeightRaw(formatted);
  }, [weightRaw, formData.weight, setField]);

  const applyVoice = useCallback((payload: VoiceApplyPayload) => {
    setFormData((f) => {
      const next = { ...f };
      if (payload.fields.pasShape !== undefined) next.pasShape = payload.fields.pasShape;
      if (payload.fields.attrDamage !== undefined) next.attrDamage = payload.fields.attrDamage;
      if (payload.fields.attrColor !== undefined) next.attrColor = payload.fields.attrColor;
      if (payload.fields.location !== undefined) next.location = payload.fields.location;
      if (payload.fields.weight !== undefined) next.weight = payload.fields.weight.toFixed(2);
      if (payload.fields.attrCollectible !== undefined) next.attrCollectible = payload.fields.attrCollectible;
      if (payload.voiceNotes) {
        next.voiceNotes = next.voiceNotes ? `${next.voiceNotes.trimEnd()}\n\n${payload.voiceNotes}` : payload.voiceNotes;
      }
      return next;
    });
    if (payload.fields.weight !== undefined) setWeightRaw(payload.fields.weight.toFixed(2));
  }, []);

  const value = useMemo<ItemFormContextValue>(() => {
    const catalogNumber = `${item.box.code}-${item.evidNumber}`;
    const reviewMode = item.pricingStatus === 'NEEDS_REVIEW' || item.pricingStatus === 'NEEDS_INPUT';
    const w = parseFloat(formData.weight);
    const missingHighlight = {
      pasShape: reviewMode && !formData.pasShape,
      attrDamage: reviewMode && !formData.attrDamage,
      attrColor: reviewMode && (!formData.attrColor || formData.attrColor.length === 0),
      location: reviewMode && !formData.location,
      weight: reviewMode && (!formData.weight || !Number.isFinite(w) || w <= 0),
    };
    const publishBlocked = !!item.pricingStatus && item.pricingStatus !== 'OK' && item.pricingStatus !== 'STALE';
    const blockedTitle = publishBlocked
      ? 'Dopiš chybějící údaje a spusť „Přepočítat" v zakázce — kámen ve stavu '
        + (item.pricingStatus === 'NEEDS_INPUT' ? 'BEZ VSTUPŮ' : 'K REVIZI') + ' nelze vystavit.'
      : undefined;
    // 0 % je platná sazba (firma není plátce DPH, 12. 10. 2026) — fallback jen pro kámen bez zakázky.
    const vatRate = item.vatRatePct != null && Number.isFinite(Number(item.vatRatePct)) ? Number(item.vatRatePct) : 0;
    return {
      item, formData, setField, patch, saveState, saveNow: handleSave, catalogNumber,
      reviewMode, missingHighlight, publishBlocked, blockedTitle, vatRate, isAdmin,
      weightRaw, setWeightRaw, commitWeight, applyVoice,
    };
  }, [item, formData, setField, patch, saveState, handleSave, weightRaw, commitWeight, applyVoice]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
