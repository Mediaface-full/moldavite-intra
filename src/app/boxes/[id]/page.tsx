import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import * as fs from 'fs';
import * as path from 'path';
import ItemsTable from '@/components/ItemsTable';
import BoxPhotoUpload from '@/components/BoxPhotoUpload';
import BoxPlacement from '@/components/BoxPlacement';
import CassetteTypePicker from '@/components/CassetteTypePicker';
import AiBulkButton from '@/components/AiBulkButton';
import BoxDeleteButton from '@/components/BoxDeleteButton';
import GenerateItemsButton from '@/components/GenerateItemsButton';
import BoxSellerPicker from '@/components/BoxSellerPicker';
import FtpUploadInfo from '@/components/FtpUploadInfo';
import BoxFieldInput from '@/components/BoxFieldInput';
import BoxNameInline from '@/components/BoxNameInline';
import BoxPpgField from '@/components/BoxPpgField';
import BoxIntegrityCheck from '@/components/BoxIntegrityCheck';
import { getSession } from '@/lib/auth';

export default async function BoxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const box = await prisma.box.findUnique({
    where: { id: parseInt(id) },
    include: {
      items: {
        orderBy: { evidNumber: 'asc' },
      },
      // Order info pro breadcrumb + back link — kazeta může (ale nemusí)
      // patřit zakázce. Pokud orderId NULL, kazeta je skladová (legacy).
      // totalPurchase / declaredWeight / defaultPpg + _count.boxes nám umoznuji
      // ukazat zdedene hodnoty jako placeholder v inputech kazety (kdyz zakazka
      // ma jen 1 kazetu, deleni je triviální = celá hodnota patří této kazete).
      order: {
        select: {
          id: true,
          code: true,
          title: true,
          totalPurchaseAmountCzk: true,
          declaredWeight: true,
          defaultPurchasePricePerGramCzk: true,
          vatRatePct: true,
          _count: { select: { boxes: true } },
        },
      },
    },
  });

  if (!box) notFound();

  const shopCount = box.items.filter((i) => i.onShop).length;
  const etsyCount = box.items.filter((i) => i.onEtsy).length;
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';

  // Zdedene hodnoty pro placeholder inputu v hlavicce kazety.
  // Skutecny pocet kamenu uz mame (vzdy), takze ho ukazeme jako default i kdyz
  // user nezadal declaredPieces. Penize a vahu dedime jen pokud zakazka ma
  // jedinou kazetu (jasna mapace; pri vice kazetach by deleni bylo nejednoznacne).
  const actualItemsCount = box.items.length;
  const isSoleBoxInOrder = !!box.order && box.order._count.boxes === 1;

  // Soucty z kamenu — vyuzitelne i pro Box bez vlastnich totals.
  // Vaha = suma vsech item.weight. Nakupni cena = suma vsech item.purchasePrice
  // (po PPG x weight z fallback retezce, kalkulovano pri Prepocitat).
  const itemsWeightSum = box.items.reduce(
    (sum, it) => sum + (it.weight ? Number(it.weight) : 0),
    0,
  );
  const itemsPurchaseSum = box.items.reduce(
    (sum, it) => sum + (it.purchasePrice ? Number(it.purchasePrice) : 0),
    0,
  );

  // Priorita placeholder: 1) skutecny soucet z items (nejpresnejsi),
  // 2) zakazka (pokud 1 kazeta, jasna mapace), 3) null. Tooltip vysvetli zdroj.
  const inheritedFromOrder = {
    purchaseAmount: itemsPurchaseSum > 0
      ? itemsPurchaseSum.toFixed(2)
      : (isSoleBoxInOrder && box.order?.totalPurchaseAmountCzk
          ? box.order.totalPurchaseAmountCzk.toString()
          : null),
    purchaseAmountSource: itemsPurchaseSum > 0
      ? `Σ z ${actualItemsCount} kamenů (kupní = váha × Kč/g)`
      : 'Hodnota převzata ze zakázky (1 kazeta v zakázce)',
    declaredWeight: itemsWeightSum > 0
      ? itemsWeightSum.toFixed(2)
      : (isSoleBoxInOrder && box.order?.declaredWeight
          ? box.order.declaredWeight.toString()
          : null),
    declaredWeightSource: itemsWeightSum > 0
      ? `Σ z ${actualItemsCount} kamenů (skutečná naměřená)`
      : 'Hodnota převzata ze zakázky (1 kazeta v zakázce)',
  };
  // PPG ze zakazky (default explicit nebo dopocet z totalPurchase/declaredWeight).
  // Tahle hodnota se pouzije na vsechny kazety v zakazce pres calculate.ts fallback
  // chain, takze ji zobrazit i tady jako placeholder davat smysl bez ohledu na pocet kazet.
  let orderInheritedPpg: { value: string; source: 'default' | 'compute' } | null = null;
  if (box.order?.defaultPurchasePricePerGramCzk) {
    orderInheritedPpg = { value: box.order.defaultPurchasePricePerGramCzk.toString(), source: 'default' };
  } else if (box.order?.totalPurchaseAmountCzk && box.order.declaredWeight && Number(box.order.declaredWeight) > 0) {
    const computed = Number(box.order.totalPurchaseAmountCzk) / Number(box.order.declaredWeight);
    orderInheritedPpg = { value: computed.toFixed(2), source: 'compute' };
  }

  // KPI sums pro kazetu (stejny pattern jako Order Overview).
  const sumRecommendedInclVat = box.items.reduce((s, it) => s + Number(it.finalInternalPriceInclVatCzk ?? 0), 0);
  const sumRecommendedExVatStored = box.items.reduce((s, it) => s + Number(it.computedMinPriceExVatCzk ?? 0), 0);
  const vatRate = Number(box.order?.vatRatePct ?? 21);
  const vatMultiplier = 1 + vatRate / 100;
  const sumRecommendedExVat = sumRecommendedExVatStored > 0
    ? sumRecommendedExVatStored
    : sumRecommendedInclVat / vatMultiplier;
  // Nakup celkem kazety: skutecna suma z kamenu (po Prepocitat) NEBO declared
  // (purchaseAmountCzk pole na Box). Suma z kamenu je nejpresnejsi pokud Prepocitat probehl.
  const boxPurchaseTotal = itemsPurchaseSum > 0
    ? itemsPurchaseSum
    : Number(box.purchaseAmountCzk ?? 0);

  const fmtMoney = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return '—';
    return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
  };

  return (
    <div>
      {/* Breadcrumb — pokud kazeta patří zakázce, vlož link na ni mezi „Kazety" a kód */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 flex-wrap">
        <Link href="/boxes" className="hover:text-foreground transition-colors">
          Kazety
        </Link>
        <span>/</span>
        {box.order && (
          <>
            <Link
              href={`/orders/${box.order.id}`}
              className="hover:text-foreground transition-colors"
              title="Zpět na zakázku"
            >
              {box.order.code}{box.order.title ? ` — ${box.order.title}` : ''}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">{box.code}</span>
      </div>

      {/* Header — title + stats vlevo, actions vpravo */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight font-mono">{box.code}</h1>
          {box.order && (
            <Link
              href={`/orders/${box.order.id}`}
              className="inline-flex items-center gap-1.5 mt-1.5 text-sm text-primary hover:underline group"
              title="Otevřít zakázku"
            >
              <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Zakázka:</span>
              <span className="font-mono font-medium">{box.order.code}</span>
              {box.order.title && <span className="text-muted-foreground">— {box.order.title}</span>}
              <span className="text-muted-foreground/60 group-hover:text-primary transition-colors">↗</span>
            </Link>
          )}
          <BoxNameInline
            boxId={box.id}
            initial={isDefaultBoxName(box.name ?? '', box.code) ? '' : (box.name ?? '')}
          />
          <div className="flex items-center gap-x-5 gap-y-1 mt-2.5 text-sm font-mono flex-wrap">
            <span><span className="text-foreground font-semibold">{box.items.length}</span> <span className="text-muted-foreground">kamenů</span></span>
            <span><span className="text-primary font-semibold">{shopCount}</span> <span className="text-muted-foreground">na eshopu</span></span>
            <span><span className="text-warning font-semibold">{etsyCount}</span> <span className="text-muted-foreground">na Etsy</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <GenerateItemsButton
            boxId={box.id}
            currentCount={box.items.length}
            declaredPieces={box.declaredPieces ?? null}
          />
          {isAdmin && (
            <AiBulkButton
              boxCode={box.code}
              items={box.items.map(i => ({ id: i.id, evidNumber: i.evidNumber }))}
            />
          )}
          {isAdmin && (
            <BoxDeleteButton
              boxId={box.id}
              boxCode={box.code}
              itemCount={box.items.length}
            />
          )}
        </div>
      </div>

      {/* KPI tiles — stejny pattern jako Order Overview, ale per kazeta */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiTile label="Nákup kazety" value={fmtMoney(boxPurchaseTotal)} color="var(--muted-foreground)" />
        <KpiTile label="Doporučená tržba (bez DPH)" value={fmtMoney(sumRecommendedExVat)} color="var(--muted-foreground)" />
        <KpiTile label="Doporučená tržba (s DPH)" value={fmtMoney(sumRecommendedInclVat)} color="var(--success)" />
      </div>

      {/* Properties — 2 řádky × 3 sloupce */}
      <div className="bg-card border border-border rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          <PropRow label="Dodavatel">
            <BoxSellerPicker boxId={box.id} initial={box.sellerId} bare />
          </PropRow>
          <PropRow label="Typ kazety">
            <CassetteTypePicker boxId={box.id} current={box.cassetteType} />
          </PropRow>
          <PropRow label="Umístění">
            <BoxPlacement boxId={box.id} placement={box.placement} bare />
          </PropRow>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border border-t border-border">
          <PropRow label="Počet kamenů">
            <BoxFieldInput
              boxId={box.id}
              field="declaredPieces"
              initial={box.declaredPieces}
              type="number"
              step="1"
              min={0}
              max={9999}
              suffix="ks"
              inheritedHint={actualItemsCount > 0 ? String(actualItemsCount) : null}
              inheritedHintTitle={`Skutečně v kazetě: ${actualItemsCount} ks`}
            />
          </PropRow>
          <PropRow label="Nákupní cena">
            <BoxFieldInput
              boxId={box.id}
              field="purchaseAmountCzk"
              initial={box.purchaseAmountCzk?.toString() ?? null}
              type="number"
              step="0.01"
              min={0}
              suffix="Kč"
              inheritedHint={inheritedFromOrder.purchaseAmount}
              inheritedHintTitle={inheritedFromOrder.purchaseAmountSource}
            />
          </PropRow>
          <PropRow label="Váha celkem">
            <BoxFieldInput
              boxId={box.id}
              field="declaredWeight"
              initial={box.declaredWeight?.toString() ?? null}
              type="number"
              step="0.01"
              min={0}
              suffix="g"
              inheritedHint={inheritedFromOrder.declaredWeight}
              inheritedHintTitle={inheritedFromOrder.declaredWeightSource}
            />
          </PropRow>
        </div>
        <div className="border-t border-border">
          <PropRow label="Cena za gram">
            <BoxPpgField
              boxId={box.id}
              initial={box.purchasePricePerGramCzk?.toString() ?? null}
              computedFrom={
                box.purchaseAmountCzk && box.declaredWeight && Number(box.declaredWeight) > 0
                  ? (Number(box.purchaseAmountCzk) / Number(box.declaredWeight)).toFixed(2)
                  : null
              }
              orderInherited={orderInheritedPpg?.value ?? null}
              orderInheritedSource={orderInheritedPpg?.source ?? null}
            />
          </PropRow>
        </div>
      </div>

      {/* Kontrolní součty kazety — Σ items vs deklarované */}
      <BoxIntegrityCheck
        declaredPieces={box.declaredPieces ?? null}
        declaredWeight={box.declaredWeight?.toString() ?? null}
        purchaseAmountCzk={box.purchaseAmountCzk?.toString() ?? null}
        purchasePricePerGramCzk={box.purchasePricePerGramCzk?.toString() ?? null}
        items={box.items.map((it) => ({
          weight: it.weight?.toString() ?? null,
          purchasePrice: it.purchasePrice?.toString() ?? null,
        }))}
      />

      {/* Box Photos */}
      <BoxPhotoUpload
        boxId={box.id}
        boxCode={box.code}
        existingPhotos={box.photos}
      />

      {/* FTP upload info card */}
      <FtpUploadInfo
        boxCode={box.code}
        photosBasePath={process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE')}
        items={box.items.map((it) => {
          const photoDir = path.join(
            process.env.PHOTOS_PATH || path.join(process.cwd(), '../kameny/FOTO_MOLDAVITE'),
            box.code,
            it.evidNumber
          );
          let hasPhotos = false;
          try {
            if (fs.existsSync(photoDir)) {
              hasPhotos = fs.readdirSync(photoDir).some((f) => /\.(jpe?g|png|webp)$/i.test(f));
            }
          } catch { /* ignore stat errors */ }
          return { evidNumber: it.evidNumber, hasPhotos };
        })}
      />

      {/* Items Table */}
      <ItemsTable
        boxCode={box.code}
        items={box.items.map((item) => ({
          id: item.id,
          evidNumber: item.evidNumber,
          description: item.description,
          location: item.location,
          storage: item.storage,
          purchasePrice: item.purchasePrice.toString(),
          salePrice: item.salePrice.toString(),
          weight: item.weight.toString(),
          sold: item.sold,
          onShop: item.onShop,
          onEtsy: item.onEtsy,
          mainPhoto: item.mainPhoto,
          photoPath: item.photoPath,
          pasShape: item.pasShape,
          // Pro warning trojuhelnik ve sloupci „Stav".
          pricingStatus: item.pricingStatus,
          attrDamage: item.attrDamage,
          attrColor: item.attrColor,
        }))}
      />
    </div>
  );
}

/**
 * Vrátí true pokud `box.name` je default vygenerovaný název ("Kazeta XXXX",
 * "Krabice XXXX" — legacy) — v tom případě je redundantní k title `box.code`
 * a v UI ho neukazujeme. User-set jméno se respektuje.
 */
function isDefaultBoxName(name: string, code: string): boolean {
  const n = name.trim().toLowerCase();
  const c = code.trim().toLowerCase();
  return n === `kazeta ${c}` || n === `krabice ${c}`;
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 flex items-center gap-3 min-w-0">
      <label className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-mono whitespace-nowrap w-28 flex-shrink-0">
        {label}
      </label>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
    </div>
  );
}
