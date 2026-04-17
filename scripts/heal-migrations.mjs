// Removes "failed" rows from _prisma_migrations so that `prisma migrate deploy`
// will retry them on next run. Safe to run on a fresh DB (skips if table missing).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const exists = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') AS ok`
  );
  if (!exists[0]?.ok) {
    console.log('[heal] _prisma_migrations does not exist yet — nothing to heal.');
    process.exit(0);
  }

  const failed = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL`
  );

  if (failed.length === 0) {
    console.log('[heal] No failed migrations found.');
    process.exit(0);
  }

  for (const row of failed) {
    console.log(`[heal] Removing failed migration record: ${row.migration_name}`);
  }

  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM "_prisma_migrations" WHERE finished_at IS NULL`
  );
  console.log(`[heal] Removed ${deleted} failed migration record(s). migrate deploy will retry them.`);
} catch (err) {
  console.log('[heal] Non-fatal error, continuing:', err?.message || err);
} finally {
  await prisma.$disconnect();
}
