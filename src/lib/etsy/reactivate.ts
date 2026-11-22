/** Kameny stažené z Etsy kvůli košíku e-shopu, jejichž rezervace mezitím vypršela → job activate. */
import { prisma } from '@/lib/prisma';
import { enqueueEtsyJob } from './queue';

export async function reactivateExpiredReservations(): Promise<number> {
  const now = new Date();
  const rows = await prisma.etsyListing.findMany({
    where: { blockedReason: 'reservation', item: { shopReservations: { none: { releasedAt: null, expiresAt: { gt: now } } } } },
    select: { itemId: true },
  });
  for (const r of rows) await enqueueEtsyJob(prisma, r.itemId, 'activate', 'reservation_expired');
  return rows.length;
}
