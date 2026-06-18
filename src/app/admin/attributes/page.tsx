import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AttributesAdminClient from '@/components/AttributesAdminClient';

export default async function AttributesAdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect('/');

  const options = await prisma.attrOption.findMany({
    orderBy: [{ attrKey: 'asc' }, { sortOrder: 'asc' }, { value: 'asc' }],
  });

  // Rozděl podle attrKey pro UI sekce
  const grouped: Record<string, typeof options> = {};
  for (const o of options) {
    if (!grouped[o.attrKey]) grouped[o.attrKey] = [];
    grouped[o.attrKey].push(o);
  }

  return <AttributesAdminClient initialGrouped={grouped} />;
}
