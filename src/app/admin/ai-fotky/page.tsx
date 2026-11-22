/**
 * Kontrola AI fotek (Gideon 22. 11. 2026: „227 fotek — stránka, kde je uvidím vedle sebe a budu jen odklikávat").
 * Všechny e-shopové fotky ve stavu „ke kontrole" (obrys na AI verzi se liší od originálu) na jednom místě.
 */
import AiPhotoReview, { type ReviewEntry } from '@/components/AiPhotoReview';
import { requirePageAdmin } from '@/lib/pageAuth';
import { prisma } from '@/lib/prisma';
import { parseAiPhotos } from '@/lib/photos/aiPhotos';
import { resolveShopSlots } from '@/lib/photos/shopSelection';
import { availableSlots } from '@/lib/photos/enhanceItem';

export const dynamic = 'force-dynamic';

export default async function AiPhotoReviewPage() {
  await requirePageAdmin();
  const items = await prisma.item.findMany({
    where: { sold: false, aiPhotos: { not: { equals: null } } },
    orderBy: [{ box: { code: 'asc' } }, { evidNumber: 'asc' }],
    select: { id: true, evidNumber: true, photoPath: true, mainPhoto: true, shopPhotos: true, aiPhotos: true, box: { select: { code: true } } },
  });

  const entries: ReviewEntry[] = [];
  for (const item of items) {
    const ai = parseAiPhotos(item.aiPhotos);
    const suspect = Object.entries(ai).filter(([, e]) => e.status === 'suspect');
    if (!suspect.length || !item.photoPath) continue;
    // Jen fotky, které opravdu jdou do e-shopu (ruční výběr mohl mezitím slot vyřadit)
    const { slots } = resolveShopSlots(availableSlots(item.photoPath), item.mainPhoto, item.shopPhotos);
    for (const [k, e] of suspect) {
      const slot = Number(k);
      if (!slots.includes(slot)) continue;
      entries.push({
        itemId: item.id,
        catalogNumber: `${item.box.code}-${item.evidNumber}`,
        slot,
        score: e.score,
        originalSrc: `/images/${item.photoPath}/${String(slot).padStart(2, '0')}.jpg`,
        aiSrc: `/images/${item.photoPath}/ai/${e.file}`,
      });
    }
  }

  return <AiPhotoReview entries={entries} />;
}
