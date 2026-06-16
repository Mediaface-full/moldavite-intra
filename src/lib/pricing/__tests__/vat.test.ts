import { describe, it, expect } from 'vitest';
import { addVat, removeVat } from '../vat';
import { Decimal } from '../decimal';

describe('addVat', () => {
  it('21% → 1000 → 1210', () => {
    expect(addVat(new Decimal('1000'), new Decimal('21')).toString()).toBe('1210');
  });
  it('0% → 1000 → 1000', () => {
    expect(addVat(new Decimal('1000'), new Decimal('0')).toString()).toBe('1000');
  });
  it('15% → 1000 → 1150', () => {
    expect(addVat(new Decimal('1000'), new Decimal('15')).toString()).toBe('1150');
  });
  it('záporná sazba vyhodí chybu', () => {
    expect(() => addVat(new Decimal('1000'), new Decimal('-5'))).toThrow();
  });
});

describe('removeVat', () => {
  it('21% → 1210 → 1000', () => {
    expect(removeVat(new Decimal('1210'), new Decimal('21')).toString()).toBe('1000');
  });
  it('addVat → removeVat je idempotentní', () => {
    const original = new Decimal('1234.56');
    const withVat = addVat(original, new Decimal('21'));
    const back = removeVat(withVat, new Decimal('21'));
    expect(back.toDecimalPlaces(2).toString()).toBe('1234.56');
  });
});
