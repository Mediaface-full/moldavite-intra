import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StonePhotoWithViewer from '@/components/StonePhotoWithViewer';
import ItemDetailForm from '@/components/ItemDetailForm';
import ItemPhotoUploadModal from '@/components/ItemPhotoUploadModal';
import MediaToggle from '@/components/MediaToggle';
import AiButton from '@/components/AiButton';
import { getSession } from '@/lib/auth';
import { resolveMargin } from '@/lib/pricing/margin';
import type { PricingConfigSnapshot, StoneInput } from '@/lib/pricing/types';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id: parseInt(id) },
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

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';

  // Breakdown — bud z DB (ulozene posledni Prepocitat), nebo on-the-fly z aktualniho
  // PricingConfig + item attrs. Fallback resi pripady kdy Prepocitat probehlo PRED
  // pridanim sloupce priceCalcBreakdown — bez nej by tooltip „pouzite koeficienty"
  // mlcel a Gideon by musel slepe klikat Prepocitat.
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

  return (
    <div>
      {/* Breadcrumb — pokud kazeta patri do zakazky, ukaz radici hierarchii:
          Zakazky / {order.code} / {box.code} / {evidNumber}. Jinak pouvodni
          plocha hierarchie Kazety / {box.code} / {evidNumber}. */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 flex-wrap">
        {item.box.order ? (
          <>
            <Link href="/orders" className="hover:text-foreground transition-colors">
              Zakázky
            </Link>
            <span>/</span>
            <Link
              href={`/orders/${item.box.order.id}`}
              className="hover:text-foreground transition-colors"
              title={item.box.order.title || undefined}
            >
              {item.box.order.code}
            </Link>
            <span>/</span>
          </>
        ) : (
          <>
            <Link href="/boxes" className="hover:text-foreground transition-colors">
              Kazety
            </Link>
            <span>/</span>
          </>
        )}
        <Link
          href={`/boxes/${item.box.id}`}
          className="hover:text-foreground transition-colors"
        >
          {item.box.code}
        </Link>
        <span>/</span>
        <span className="text-foreground">{item.evidNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">
          Moldavit{' '}
          <span className="text-primary">{catalogNumber}</span>
        </h1>
        <div className="flex items-center gap-2">
          {item.sold && (
            <span className="bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] text-destructive text-xs px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)]">
              Prodáno
            </span>
          )}
          {item.onShop && !item.sold && (
            <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">
              Eshop
            </span>
          )}
          {item.onEtsy && !item.sold && (
            <span className="bg-warning text-white text-xs px-3 py-1 rounded-full">
              Etsy
            </span>
          )}
          {isAdmin && (
            <AiButton itemId={item.id} catalogNumber={catalogNumber} />
          )}
          <ItemPhotoUploadModal itemId={item.id} catalogNumber={catalogNumber} label="Fotky" />
        </div>
      </div>

      {/* Certificate + Media buttons */}
      <div className="flex items-center gap-3 mb-6">
        <a
          href={`/api/certificate/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-muted border border-border hover:border-ring text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Certifikát PDF
        </a>
        {item.certHash && (
          <a
            href={`/verify/${item.certHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Verifikační stránka
          </a>
        )}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: 360° Viewer */}
        <div>
          <StonePhotoWithViewer
            photoPath={item.photoPath}
            evidNumber={catalogNumber}
            itemId={item.id}
            mainPhoto={item.mainPhoto}
          />
        </div>

        {/* Right: Detail Form */}
        <div>
          <ItemDetailForm
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
            }}
          />
        </div>
      </div>

      {/* Film + Video - hidden under toggle */}
      {item.photoPath && (
        <MediaToggle photoPath={item.photoPath} catalogNumber={catalogNumber} />
      )}
    </div>
  );
}
