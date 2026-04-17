import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const configs = await prisma.exportConfig.findMany();
  return NextResponse.json(configs);
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { exportType, currencies, primaryCurrency, commission, roundPrices, languages, primaryLanguage } = await request.json();

  const config = await prisma.exportConfig.upsert({
    where: { exportType },
    update: {
      ...(currencies !== undefined && { currencies }),
      ...(primaryCurrency !== undefined && { primaryCurrency }),
      ...(commission !== undefined && { commission }),
      ...(roundPrices !== undefined && { roundPrices }),
      ...(languages !== undefined && { languages }),
      ...(primaryLanguage !== undefined && { primaryLanguage }),
    },
    create: {
      exportType,
      currencies: currencies || ['CZK'],
      primaryCurrency: primaryCurrency || 'CZK',
      commission: commission || 0,
      roundPrices: roundPrices !== false,
    },
  });

  return NextResponse.json(config);
}
