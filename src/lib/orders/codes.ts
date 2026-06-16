/**
 * Generování unikátních Order code: Z{rok}-{poradi 3-digit}, např. Z2026-001.
 *
 * Race-safe: findFirst + create není atomické (souběžné požadavky by mohly
 * získat stejný code → unique constraint violation). Volající `route.ts`
 * tedy CHYTÁ violation a volá znovu — viz `generateOrderCodeWithRetry`.
 */
import { prisma } from '../prisma';

export async function generateOrderCode(date: Date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const prefix = `Z${year}-`;
  const last = await prisma.order.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  let next = 1;
  if (last) {
    const m = last.code.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** Detekce Prisma P2002 (unique constraint violation). */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === 'P2002';
}
