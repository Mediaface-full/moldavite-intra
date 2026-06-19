import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';

const ALLOWED_BULK_FIELDS = ['salePrice', 'purchasePrice', 'onShop', 'onEtsy', 'sold', 'pasShape'];

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { updates } = body as { updates: Array<Record<string, unknown>> };

  if (!updates || !Array.isArray(updates) || updates.length > 500) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Validate IDs PŘED otevřením transakce — invalid id by jinak shodil celou
  // batch mid-flight (Prisma runtime error v transakci). Plus předchází DoS
  // pokud klient pošle 500 batch s garbage IDs.
  for (const update of updates) {
    const id = (update as { id?: unknown }).id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Každá položka musí mít id: positive integer' }, { status: 422 });
    }
  }

  const results = await prisma.$transaction(
    updates.map((update) => {
      const { id, ...fields } = update;
      const data: Record<string, unknown> = {};
      for (const key of ALLOWED_BULK_FIELDS) {
        if (fields[key] !== undefined) data[key] = fields[key];
      }
      if (session.role !== 'ADMIN') delete data.purchasePrice;
      return prisma.item.update({ where: { id: id as number }, data });
    })
  );

  await logActivity(session.id, 'item.bulk_update', '', `Bulk update: ${results.length} items`);
  return NextResponse.json({ updated: results.length });
}
