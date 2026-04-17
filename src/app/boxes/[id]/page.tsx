import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ItemsTable from '@/components/ItemsTable';
import BoxPhotoUpload from '@/components/BoxPhotoUpload';
import BoxPlacement from '@/components/BoxPlacement';
import AiBulkButton from '@/components/AiBulkButton';
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
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link href="/boxes" className="hover:text-text-primary transition-colors">
          Krabice
        </Link>
        <span>/</span>
        <span className="text-text-primary">{box.code}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{box.code}</h1>
          {box.name && (
            <p className="text-text-secondary mt-1">{box.name}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
            <span>{box.items.length} kamenů</span>
            <span className="text-moldavite-400">{shopCount} na eshopu</span>
            <span className="text-orange-400">{etsyCount} na Etsy</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <AiBulkButton
              boxCode={box.code}
              items={box.items.map(i => ({ id: i.id, evidNumber: i.evidNumber }))}
            />
          )}
          <BoxPlacement boxId={box.id} placement={box.placement} />
        </div>
      </div>

      {/* Box Photos */}
      <BoxPhotoUpload
        boxId={box.id}
        boxCode={box.code}
        existingPhotos={box.photos}
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
        }))}
      />
    </div>
  );
}
