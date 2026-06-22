'use client';

import { useState, useEffect } from 'react';
import { parseDecimalCs } from '@/lib/utils';

/**
 * Číselný vstup co akceptuje českou desetinnou čárku I tečku.
 *
 * HTML `<input type="number">` defaultně odmítá čárku v většině locale —
 * uživatel napíše „3," a vstup ho neuloží. Tato komponenta používá
 * `type="text"` + `inputMode="decimal"` + parseDecimalCs na save.
 *
 * Drží vlastní text state aby se nezráca mid-typing pozice (Gideon
 * preferuje „50,5" → parser by jinak vracel 50 → re-render by ukázal
 * „50" a uživatel ztratil čárku).
 *
 * Sync s external `value` jen pokud se parsed liší (např. po reset).
 */
export default function DecimalInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  allowNegative = false,
  min,
  max,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const [text, setText] = useState<string>(value === null || value === undefined ? '' : String(value));

  // Sync external value → text pokud se výrazně liší (např. reset z parent)
  useEffect(() => {
    const parsed = parseDecimalCs(text);
    const expected = value === null || value === undefined ? NaN : value;
    if (Number.isFinite(parsed) && Number.isFinite(expected)) {
      if (Math.abs(parsed - expected) < 0.00005) return; // OK
    } else if (!Number.isFinite(parsed) && !Number.isFinite(expected)) {
      return; // both empty/invalid, OK
    }
    setText(value === null || value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(raw: string) {
    setText(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(null);
      return;
    }
    const n = parseDecimalCs(trimmed);
    if (!Number.isFinite(n)) return; // mid-typing („3," nebo „-")
    if (!allowNegative && n < 0) return;
    if (min !== undefined && n < min) return;
    if (max !== undefined && n > max) return;
    onChange(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => {
        // Re-format na blur: „3," → „3", „abc" → orig value
        const n = parseDecimalCs(text);
        if (Number.isFinite(n)) {
          setText(String(n));
        } else if (text.trim() === '') {
          setText('');
        } else {
          // Invalid — vrátíme se na poslední valid value
          setText(value === null || value === undefined ? '' : String(value));
        }
      }}
      className={className}
    />
  );
}
