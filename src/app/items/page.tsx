import { prisma } from '@/lib/prisma';
import ItemsTable from '@/components/ItemsTable';

export default async function ItemsPage() {
  const items = await prisma.item.findMany({
    include: { box: { select: { code: true } } },
    orderBy: { evidNumber: 'asc' },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Všechny kameny</h1>
        <p className="text-text-secondary mt-1">
          Celkem {items.length} moldavitů v evidenci
        </p>
      </div>

      <ItemsTable
        items={items.map((item) => ({
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
          box: item.box,
        }))}
      />
    </div>
  );
}
