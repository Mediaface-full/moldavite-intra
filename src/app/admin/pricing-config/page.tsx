import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import PricingConfigClient from '@/components/orders/PricingConfigClient';

export default async function PricingConfigPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect('/');

  const configs = await prisma.pricingConfig.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return <PricingConfigClient configs={configs.map((c) => ({ ...c, rules: c.rules })) as never} />;
}
