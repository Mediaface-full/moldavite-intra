import { NextRequest, NextResponse } from 'next/server';
import { fetchAndSaveRates } from '@/lib/rates';
import { prisma } from '@/lib/prisma';
import { timingSafeEqual } from 'crypto';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') || '';
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(expectedSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  try {
    const rates = await fetchAndSaveRates();

    // Auto-cleanup: delete logs older than 1 year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cleaned = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: oneYearAgo } },
    });

    return NextResponse.json({
      success: true,
      rates: rates.map(r => `${r.currency}=${r.rate}`),
      logsCleanup: cleaned.count,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 });
  }
}
