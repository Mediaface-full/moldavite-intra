/**
 * Decimal helpery. Veškerá peněžní aritmetika v modulu jde přes decimal.js
 * aby se vyhnulo float driftu (0.1 + 0.2 !== 0.3).
 *
 * Vstup a výstup modulu používá string (sjednoceno se zbytkem projektu —
 * Prisma Decimal pole serializuje do JSON jako string).
 */
import Decimal from 'decimal.js';

// Konfigurace decimal.js — 28 platných číslic, ceiling pro money.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP, // default; ceil děláme explicitně
});

/** Bezpečně převede string|null|undefined na Decimal. NULL/prázdný/NaN → null. */
export function toDecimalOrNull(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const d = new Decimal(value);
    if (d.isNaN()) return null;
    return d;
  } catch {
    return null;
  }
}

/** Stejné jako toDecimalOrNull, ale 0 pokud vstup chybí (pro defaultní hodnoty). */
export function toDecimal(value: string | number | null | undefined): Decimal {
  return toDecimalOrNull(value) ?? new Decimal(0);
}

/** Serializace peněžní hodnoty na 2 desetinná místa. */
export function moneyString(d: Decimal): string {
  return d.toFixed(2);
}

/** Serializace marže (decimální multiplikátor) na 4 desetinná místa. */
export function rateString(d: Decimal): string {
  return d.toFixed(4);
}

/** Stejné jako moneyString, ale pro null vrací null (nesnímá NULL). */
export function moneyStringOrNull(d: Decimal | null): string | null {
  return d === null ? null : moneyString(d);
}

export { Decimal };
