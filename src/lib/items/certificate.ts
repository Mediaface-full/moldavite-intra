/**
 * Vystavení certifikátu kamene: certHash (16 hex) + certIssuedAt, jednou a navždy.
 * Vytaženo z GET /api/certificate/[id] (PDF), aby certifikát vystavil i prodej z e-shopu
 * (Shop API v1 POST /sold — Gideon 4. 10. 2026: certifikát se vystavuje při prodeji).
 */
import { createHash, randomBytes } from 'crypto';
import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export function newCertHash(itemId: number, catalogNumber: string): string {
  return createHash('sha256')
    .update(`${itemId}-${catalogNumber}-${randomBytes(8).toString('hex')}`)
    .digest('hex')
    .substring(0, 16);
}

/** Vrátí existující certifikát, nebo ho vystaví. Idempotentní. */
export async function ensureCertificate(
  db: Db,
  item: { id: number; certHash: string; certIssuedAt: Date | null },
  catalogNumber: string,
): Promise<{ certHash: string; certIssuedAt: Date }> {
  if (item.certHash && item.certIssuedAt) {
    return { certHash: item.certHash, certIssuedAt: item.certIssuedAt };
  }
  const certHash = item.certHash || newCertHash(item.id, catalogNumber);
  const certIssuedAt = item.certIssuedAt ?? new Date();
  await db.item.update({ where: { id: item.id }, data: { certHash, certIssuedAt } });
  return { certHash, certIssuedAt };
}

export function verifyUrlFor(certHash: string): string {
  const base = process.env.VERIFY_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/verify/${certHash}`;
}
