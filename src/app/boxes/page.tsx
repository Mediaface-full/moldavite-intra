import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ScanNewBoxButton from '@/components/ScanNewBoxButton';
import BoxPhotoPreview from '@/components/BoxPhotoPreview';

export default async function BoxesPage() {
  const boxes = await prisma.box.findMany({
    include: {
      _count: { select: { items: true } },
      items: {
        where: { onShop: true },
        select: { id: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Krabice</h1>
          <p className="text-text-secondary mt-1">Správa krabic s moldavity</p>
        </div>
        <ScanNewBoxButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {boxes.map((box) => (
          <Link
            key={box.id}
            href={`/boxes/${box.id}`}
            className="bg-bg-card border border-border-color rounded-xl p-6 hover:border-moldavite-600 hover:bg-bg-card-hover transition-all group"
          >
            {/* Photos preview */}
            <BoxPhotoPreview photos={box.photos as string[]} />

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-text-primary group-hover:text-accent-gold transition-colors tracking-wide">
                {box.code}
              </h3>
              <div className="w-10 h-10 bg-moldavite-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-moldavite-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>

            {box.name && (
              <p className="text-sm text-text-secondary mb-3">{box.name}</p>
            )}

            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-secondary">
                <span className="text-text-primary font-semibold">{box._count.items}</span> kamenů
              </span>
              <span className="text-text-secondary">
                <span className="text-moldavite-400 font-semibold">{box.items.length}</span> na eshopu
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
