import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { fetchAndSaveRates, getLatestRates } from '@/lib/rates';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rates = await getLatestRates();
  return NextResponse.json(rates);
}

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rates = await fetchAndSaveRates();
  await logActivity(session.id, 'rates.fetch', '', `Načteny kurzy: ${rates.map(r => `${r.currency}=${r.rate}`).join(', ')}`);

  return NextResponse.json({ fetched: rates });
}
