import { Decimal } from './decimal';

/**
 * Zaokrouhlí hodnotu nahoru na nejbližší násobek `step`.
 *
 * ceilToStep(1752.11, 10) === 1760
 * ceilToStep(8 450,   50) === 8 450 (přesně na hraně — beze změny)
 * ceilToStep(8 450.01, 50) === 8 500
 * ceilToStep(0,        10) === 0
 */
export function ceilToStep(value: Decimal, step: number): Decimal {
  if (step <= 0) throw new Error(`ceilToStep: step musí být kladný (dostali ${step})`);
  if (value.isZero()) return new Decimal(0);
  const stepD = new Decimal(step);
  return value.div(stepD).ceil().times(stepD);
}
