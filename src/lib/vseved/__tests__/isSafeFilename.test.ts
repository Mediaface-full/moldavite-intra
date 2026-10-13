import { describe, it, expect } from 'vitest';
import { isSafeFilename } from '../storage';

describe('isSafeFilename', () => {
  it('pouští diakritiku, mezery, tečky, pomlčky, závorky', () => {
    expect(isSafeFilename('Vltavíny a Tektity.txt')).toBe(true);
    expect(isSafeFilename('Bouška — Moldavity (1968).epub')).toBe(false); // em-dash není v povolené sadě
    expect(isSafeFilename('Bouška - Moldavity (1968).epub')).toBe(true);
    expect(isSafeFilename("Rost, R. & kol. - Vltavíny' 2.txt")).toBe(true);
    expect(isSafeFilename('Žďárské vrchy_kap1.txt')).toBe(true);
  });
  it('odmítá traversal, lomítka, řídicí znaky a prázdné / dlouhé názvy', () => {
    expect(isSafeFilename('../etc/passwd.txt')).toBe(false);
    expect(isSafeFilename('a/b.txt')).toBe(false);
    expect(isSafeFilename('a\\b.txt')).toBe(false);
    expect(isSafeFilename('kniha\u0000.txt')).toBe(false);
    expect(isSafeFilename('')).toBe(false);
    expect(isSafeFilename('x'.repeat(201))).toBe(false);
    expect(isSafeFilename('<script>.txt')).toBe(false);
  });
});
