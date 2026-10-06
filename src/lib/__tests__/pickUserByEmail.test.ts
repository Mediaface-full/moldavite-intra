import { describe, it, expect } from 'vitest';
import { pickUserByEmail, normalizeEmail } from '@/lib/auth';

describe('pickUserByEmail — e-mail bez ohledu na velikost písmen', () => {
  const stored = [{ id: 7, email: 'Jan.Novak@Local.Test' }];

  it('přesně napsaný → najde', () => {
    expect(pickUserByEmail(stored, 'Jan.Novak@Local.Test')?.id).toBe(7);
  });

  it('malými písmeny / s mezerami → najde (kandidáti už přišli insensitive z DB)', () => {
    expect(pickUserByEmail(stored, 'jan.novak@local.test')?.id).toBe(7);
    expect(pickUserByEmail(stored, '  JAN.NOVAK@LOCAL.TEST ')?.id).toBe(7);
  });

  it('dva účty lišící se jen velikostí písmen → přesná shoda má přednost, jinak nejstarší', () => {
    const two = [{ id: 9, email: 'jan@x.cz' }, { id: 3, email: 'Jan@x.cz' }];
    expect(pickUserByEmail(two, 'Jan@x.cz')?.id).toBe(3);
    expect(pickUserByEmail(two, 'jan@x.cz')?.id).toBe(9);
    expect(pickUserByEmail(two, 'JAN@X.CZ')?.id).toBe(3); // žádná přesná → nejnižší id
  });

  it('nic → null', () => {
    expect(pickUserByEmail([], 'x@y.cz')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('trim + lowercase', () => {
    expect(normalizeEmail('  Jan.Novak@Local.Test ')).toBe('jan.novak@local.test');
  });
});
