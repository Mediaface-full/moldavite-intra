import { describe, it, expect } from 'vitest';
import { ceilToStep } from '../rounding';
import { Decimal } from '../decimal';

describe('ceilToStep', () => {
  it('zaokrouhlí nahoru na 10', () => {
    expect(ceilToStep(new Decimal('1752.11'), 10).toString()).toBe('1760');
  });
  it('hodnota přesně na hraně step zůstane beze změny', () => {
    expect(ceilToStep(new Decimal('8450'), 50).toString()).toBe('8450');
  });
  it('hodnota přesahující o haléř → další step', () => {
    expect(ceilToStep(new Decimal('8450.01'), 50).toString()).toBe('8500');
  });
  it('nula vrací nulu', () => {
    expect(ceilToStep(new Decimal('0'), 10).toString()).toBe('0');
  });
  it('step 100 zaokrouhlí na stovky', () => {
    expect(ceilToStep(new Decimal('17056.21'), 100).toString()).toBe('17100');
  });
  it('záporný step vyhodí chybu', () => {
    expect(() => ceilToStep(new Decimal('100'), 0)).toThrow();
    expect(() => ceilToStep(new Decimal('100'), -10)).toThrow();
  });
});
