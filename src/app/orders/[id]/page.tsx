import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import OrderDetailClient from '@/components/orders/OrderDetailClient';
import { serializeOrder, serializeCost, serializeItemForPricing } from '@/lib/orders/serialize';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) notFound();

  const [order, configs] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        costs: { orderBy: { createdAt: 'asc' } },
        items: {
          include: { box: { select: { id: true, code: true } } },
          orderBy: { evidNumber: 'asc' },
        },
        boxes: {
          select: {
            id: true, code: true, name: true,
            sellerId: true, cassetteType: true,
            declaredPieces: true, declaredWeight: true, purchaseAmountCzk: true,
          },
          orderBy: { code: 'asc' },
        },
        pricingConfig: true,
        seller: { select: { id: true, firstName: true, lastName: true, alias: true } },
      },
    }),
    prisma.pricingConfig.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
  ]);
  if (!order) notFound();

  const sellerDisplay = order.seller
    ? (`${order.seller.firstName} ${order.seller.lastName}`.trim() + (order.seller.alias ? ` (${order.seller.alias})` : ''))
    : null;

  return (
    <OrderDetailClient
      order={{
        ...serializeOrder(order),
        sellerDisplay,
        costs: order.costs.map(serializeCost),
        items: order.items.map((it) => ({
          ...serializeItemForPricing(it),
          box: it.box,
        })),
        boxes: order.boxes.map((b) => ({
          ...b,
          declaredWeight: b.declaredWeight ? b.declaredWeight.toString() : null,
          purchaseAmountCzk: b.purchaseAmountCzk ? b.purchaseAmountCzk.toString() : null,
        })),
        pricingConfig: order.pricingConfig,
      }}
      pricingConfigs={configs.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
      isAdmin={session.role === 'ADMIN'}
    />
  );
}
