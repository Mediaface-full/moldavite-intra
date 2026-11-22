/**
 * Šifrování Etsy tokenů v DB (AES-256-GCM, klíč ETSY_TOKEN_KEY = 64 hex znaků).
 * Formát: v1:<iv b64>:<auth tag b64>:<data b64>. Únik DB ≠ únik přístupu k obchodu na Etsy.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(keyHex?: string): Buffer {
  const hex = keyHex ?? process.env.ETSY_TOKEN_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('ETSY_TOKEN_KEY musí být 64 hex znaků');
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plain: string, keyHex?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(keyHex), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptToken(enc: string, keyHex?: string): string {
  const [v, iv, tag, data] = enc.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Neplatný formát šifrovaného tokenu');
  const decipher = createDecipheriv('aes-256-gcm', key(keyHex), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
