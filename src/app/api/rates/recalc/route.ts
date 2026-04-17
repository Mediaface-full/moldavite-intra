import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { recalcAllPrices } from '@/lib/pricing';

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const count = await recalcAllPrices();
  await logActivity(session.id, 'rates.recalc', '', `Přepočteno ${count} kamenů`);

  return NextResponse.json({ recalculated: count });
}
