import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ScanNewBoxButton from '@/components/ScanNewBoxButton';
import BoxPhotoPreview from '@/components/BoxPhotoPreview';
import { CASSETTE_TYPE_META } from '@/lib/cassetteType';
import Icon from '@/components/Icon';

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
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
            Bohemian Moldavite · Intra
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Kazety</h1>
          <p className="text-sm text-muted-foreground mt-1">Správa kazet s moldavity</p>
        </div>
        <ScanNewBoxButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boxes.map((box) => (
          <Link
            key={box.id}
            href={`/boxes/${box.id}`}
            className="bg-card border border-border rounded-xl p-5 hover:border-ring/60 hover:shadow-md transition-all group shadow-sm flex flex-col"
          >
            {/* Photos preview */}
            <BoxPhotoPreview photos={box.photos as string[]} />

            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors font-mono tracking-tight">
                {box.code}
              </h3>
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded font-mono uppercase tracking-wider flex-shrink-0">
                {box._count.items} ks
              </span>
            </div>

            {(() => {
              const meta = CASSETTE_TYPE_META[box.cassetteType];
              return (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border self-start mb-2"
                  style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
                  }}
                >
                  <Icon name={meta.icon} className="w-3 h-3" />
                  {meta.short}
                </span>
              );
            })()}

            {box.name && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-1">{box.name}</p>
            )}

            <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
              <span className="text-muted-foreground">
                <span className="text-foreground font-semibold">{box._count.items}</span> kamenů
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                {box.items.length} eshop
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
