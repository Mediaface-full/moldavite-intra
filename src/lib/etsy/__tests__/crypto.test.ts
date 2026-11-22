import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '@/lib/etsy/crypto';

const K1 = '11'.repeat(32);
const K2 = '22'.repeat(32);

describe('šifrování tokenů', () => {
  it('round-trip', () => {
    expect(decryptToken(encryptToken('12345678.abc', K1), K1)).toBe('12345678.abc');
  });
  it('formát v1:iv:tag:data', () => {
    expect(encryptToken('x', K1)).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
  });
  it('jiný klíč → chyba', () => {
    expect(() => decryptToken(encryptToken('tajne', K1), K2)).toThrow();
  });
  it('změněná data → chyba', () => {
    const [v, iv, tag, data] = encryptToken('tajne', K1).split(':');
    const bad = Buffer.from(data, 'base64'); bad[0] ^= 1;
    expect(() => decryptToken([v, iv, tag, bad.toString('base64')].join(':'), K1)).toThrow();
  });
  it('stejný text → pokaždé jiný výstup (náhodné IV)', () => {
    expect(encryptToken('stejne', K1)).not.toBe(encryptToken('stejne', K1));
  });
});

describe('šifrování — délka autentizačního tagu', () => {
  it('zkrácený tag (4 B) → chyba', () => {
    const [v, iv, tag, data] = encryptToken('tajne', K1).split(':');
    const short = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
    expect(() => decryptToken([v, iv, short, data].join(':'), K1)).toThrow();
  });
});
