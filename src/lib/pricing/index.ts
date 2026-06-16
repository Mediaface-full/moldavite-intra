/**
 * Cenotvorba — public API výpočtového modulu.
 *
 * Jediný entry point pro API endpointy (Etapa 2) i pro testy.
 * Modul je čistý — žádný DB hit, žádný side effect.
 */
export { calculateOrderPricing } from './calculate';
export { validateOrderForPricing } from './validate';
export { applyShopModifier, applyShopModifierToString } from './shopModifier';
export { allocateCosts } from './allocation';
export { resolveMargin } from './margin';
export { resolvePpg } from './resolve';
export { addVat, removeVat } from './vat';
export { ceilToStep } from './rounding';
export { Decimal, toDecimal, toDecimalOrNull, moneyString, rateString } from './decimal';
export type * from './types';
