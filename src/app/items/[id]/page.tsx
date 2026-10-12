import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import * as fs from 'fs';
import * as path from 'path';
import StoneDetail from '@/components/stone/StoneDetail';
import { requirePageSession } from '@/lib/pageAuth';
import { resolveMargin } from '@/lib/pricing/margin';
import type { PricingConfigSnapshot, StoneInput } from '@/lib/pricing/types';
import type { ItemMediaInfo } from '@/lib/itemReadiness';
import type { LastUpdateInfo } from '@/components/stone/types';

const PHOTOS_PATH = process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE');

/** Co je na disku v adresáři kamene — pro panel médií a checklist připravenosti. */
function readMedia(photoPath: string): ItemMediaInfo {
  const empty: ItemMediaInfo = { photoCount: 0, has360: false, hasVideo: false, hasFilm: false };
  if (!photoPath || photoPath.includes('..')) return empty;
  try {
    const dir = path.resolve(PHOTOS_PATH, photoPath);
    if (!dir.startsWith(path.resolve(PHOTOS_PATH) + path.sep)) return empty;
    const files = fs.readdirSync(dir);
    const photoCount = files.filter((f) => /^\d{2}\.jpe?g$/i.test(f)).length;
    return {
      photoCount,
      has360: photoCount >= 24,
      hasVideo: files.some((f) => /^video\.(mp4|webm)$/i.test(f)),
      hasFilm: files.some((f) => /^flim\.jpe?g$/i.test(f)),
    };
  } catch {
    return empty;
  }
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Auth PŘED jakýmkoli DB dotazem (audit 10. 9. 2026 — /items/1.svg obcházel proxy).
  const session = await requirePageSession();
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      box: {
        include: {
          // Pro breadcrumb segment „Zakázka {code}" pokud kazeta patri do zakazky.
          order: {
            select: {
              id: true, code: true, title: true,
              vatRatePct: true,
              // PricingConfig snapshot pro on-the-fly breakdown fallback (vis nize)
              pricingConfig: { select: { rules: true } },
            },
          },
        },
      },
    },
  });

  if (!item) notFound();

  const isAdmin = session.role === 'ADMIN';

  // Breakdown — bud z DB (ulozene posledni Prepocitat), nebo on-the-fly z aktualniho
  // PricingConfig + item attrs. Fallback resi pripady kdy Prepocitat probehlo PRED
  // pridanim sloupce priceCalcBreakdown.
  let effectiveBreakdown: unknown = item.priceCalcBreakdown ?? null;
  if (!effectiveBreakdown && item.box.order?.pricingConfig?.rules) {
    const rules = item.box.order.pricingConfig.rules as unknown as PricingConfigSnapshot;
    const stoneInput: StoneInput = {
      id: item.id,
      weightGrams: item.weight ? item.weight.toString() : null,
      purchasePricePerGramCzk: item.purchasePricePerGramCzk?.toString() ?? null,
      manualPriceInclVatCzk: item.manualPriceInclVatCzk?.toString() ?? null,
      attrs: {
        pasShape: item.pasShape || null,
        location: item.location || null,
        attrDamage: item.attrDamage || null,
        attrColor: item.attrColor ?? [],
        attrCollectible: item.attrCollectible,
      },
    };
    const margin = resolveMargin(stoneInput, rules);
    effectiveBreakdown = {
      marginBreakdown: margin.breakdown.map((b) => ({
        ruleKey: b.ruleKey,
        ruleLabel: b.ruleLabel,
        ruleType: b.ruleType,
        matched: b.matched,
        marginRate: b.marginRate.toString(),
      })),
      totalMarginRate: margin.totalRate.toString(),
      computedOnDemand: true,
    };
  }

  // Média na disku + poslední úprava (pro hlavičku) — paralelně.
  const [media, lastLog] = await Promise.all([
    Promise.resolve(readMedia(item.photoPath)),
    prisma.activityLog.findFirst({
      where: { action: 'item.update', target: String(item.id) },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const lastUpdate: LastUpdateInfo | null = lastLog
    ? { at: lastLog.createdAt.toISOString(), by: lastLog.user?.name || lastLog.user?.email || null }
    : null;

  return (
    <div>
      {/* Breadcrumb — pokud kazeta patri do zakazky: Zakazky / {order} / {box} / {evid}; jinak Kazety / {box} / {evid}. */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
        {item.box.order ? (
          <>
            <Link href="/orders" className="hover:text-foreground transition-colors">Zakázky</Link>
            <span>/</span>
            <Link href={`/orders/${item.box.order.id}`} className="hover:text-foreground transition-colors" title={item.box.order.title || undefined}>
              {item.box.order.code}
            </Link>
            <span>/</span>
          </>
        ) : (
          <>
            <Link href="/boxes" className="hover:text-foreground transition-colors">Kazety</Link>
            <span>/</span>
          </>
        )}
        <Link href={`/boxes/${item.box.id}`} className="hover:text-foreground transition-colors">{item.box.code}</Link>
        <span>/</span>
        <span className="text-foreground">{item.evidNumber}</span>
      </div>

      <StoneDetail
        isAdmin={isAdmin}
        media={media}
        lastUpdate={lastUpdate}
        item={{
          id: item.id,
          evidNumber: item.evidNumber,
          name: item.name,
          nameEn: item.nameEn,
          description: item.description,
          descriptionEn: item.descriptionEn,
          longDescription: item.longDescription,
          longDescriptionEn: item.longDescriptionEn,
          location: item.location,
          storage: item.storage,
          purchasePrice: item.purchasePrice.toString(),
          salePrice: item.salePrice.toString(),
          weight: item.weight.toString(),
          sold: item.sold,
          onShop: item.onShop,
          onEtsy: item.onEtsy,
          pasShape: item.pasShape,
          attrDamage: item.attrDamage,
          attrColor: item.attrColor,
          attrCollectible: item.attrCollectible,
          box: { code: item.box.code, id: item.box.id },
          order: item.box.order ? { id: item.box.order.id, code: item.box.order.code, title: item.box.order.title } : null,
          priceEUR: Number(item.priceEUR),
          priceUSD: Number(item.priceUSD),
          costBasisCzk: item.costBasisCzk ? item.costBasisCzk.toString() : null,
          computedMinPriceExVatCzk: item.computedMinPriceExVatCzk ? item.computedMinPriceExVatCzk.toString() : null,
          recommendedPriceInclVatCzk: item.recommendedPriceInclVatCzk ? item.recommendedPriceInclVatCzk.toString() : null,
          vatRatePct: item.box.order?.vatRatePct ? item.box.order.vatRatePct.toString() : null,
          manualPriceInclVatCzk: item.manualPriceInclVatCzk ? item.manualPriceInclVatCzk.toString() : null,
          purchasePricePerGramCzk: item.purchasePricePerGramCzk ? item.purchasePricePerGramCzk.toString() : null,
          pricingStatus: item.pricingStatus,
          soldAt: item.soldAt ? item.soldAt.toISOString() : null,
          priceCalcSnapshot: item.priceCalcSnapshot ?? null,
          priceCalcSnapshotAt: item.priceCalcSnapshotAt ? item.priceCalcSnapshotAt.toISOString() : null,
          priceCalcBreakdown: effectiveBreakdown,
          onShopAt: item.onShopAt ? item.onShopAt.toISOString() : null,
          onEtsyAt: item.onEtsyAt ? item.onEtsyAt.toISOString() : null,
          voiceNotes: item.voiceNotes ?? '',
          photoPath: item.photoPath,
          mainPhoto: item.mainPhoto,
          certHash: item.certHash,
          updatedAt: item.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
