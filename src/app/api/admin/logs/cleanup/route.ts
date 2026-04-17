import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const result = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: oneYearAgo } },
  });

  await logActivity(session.id, 'admin.log_cleanup', '', `Smazáno ${result.count} záznamů starších než 1 rok`);

  return NextResponse.json({ deleted: result.count });
}
