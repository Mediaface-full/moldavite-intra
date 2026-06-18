import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SellersAdminClient from '@/components/SellersAdminClient';

export default async function SellersAdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect('/');

  const sellers = await prisma.seller.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    include: { _count: { select: { orders: true, boxes: true } } },
  });

  return <SellersAdminClient initial={sellers} />;
}
