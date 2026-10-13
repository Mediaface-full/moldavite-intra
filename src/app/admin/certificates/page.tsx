import CertificatesManager from '@/components/CertificatesManager';
import { requirePageAdmin } from '@/lib/pageAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminCertificatesPage() {
  await requirePageAdmin();
  const boxes = await prisma.box.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, _count: { select: { items: true } } },
  });
  return (
    <CertificatesManager boxes={boxes.filter((b) => b._count.items > 0).map((b) => ({ id: b.id, code: b.code, count: b._count.items }))} />
  );
}
