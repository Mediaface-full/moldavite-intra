import { describe, it, expect } from 'vitest';
import { createPkce, challengeFor } from '@/lib/etsy/pkce';

describe('PKCE', () => {
  it('RFC 7636 testovací vektor', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('verifier 43–128 znaků base64url, challenge sedí, state náhodný', () => {
    const a = createPkce(), b = createPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.challenge).toBe(challengeFor(a.verifier));
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(a.state).not.toBe(b.state);
  });
});
