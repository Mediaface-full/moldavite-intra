/** OAuth 2 PKCE pro Etsy (RFC 7636, metoda S256). */
import { createHash, randomBytes } from 'crypto';

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(48).toString('base64url'); // 64 znaků
  return { verifier, challenge: challengeFor(verifier), state: randomBytes(32).toString('base64url') };
}
