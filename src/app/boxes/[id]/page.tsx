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
    },
  });

  if (!box) notFound();

  const shopCount = box.items.filter((i) => i.onShop).length;
  const etsyCount = box.items.filter((i) => i.onEtsy).length;
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/boxes" className="hover:text-foreground transition-colors">
          Kazety
        </Link>
        <span>/</span>
        <span className="text-foreground">{box.code}</span>
      </div>

      {/* Header — title + stats vlevo, actions vpravo */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight font-mono">{box.code}</h1>
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
              placeholder="—"
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
              placeholder="—"
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
              placeholder="—"
            />
          </PropRow>
        </div>
      </div>

      {/* Box Photos */}
      <BoxPhotoUpload
        boxId={box.id}
        boxCode={box.code}
        existingPhotos={box.photos}
      />

      {/* FTP upload info card */}
      <FtpUploadInfo
        boxCode={box.code}
        photosBasePath={process.env.PHOTOS_PATH || '/data/photos'}
        items={box.items.map((it) => {
          const photoDir = path.join(
            process.env.PHOTOS_PATH || '/data/photos',
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
    <div className="p-4 flex items-center gap-3">
      <label className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-mono whitespace-nowrap w-20 flex-shrink-0">
        {label}
      </label>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
