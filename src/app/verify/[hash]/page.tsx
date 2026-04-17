import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import StoneViewer360 from '@/components/StoneViewer360';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  const item = await prisma.item.findFirst({
    where: { certHash: hash },
    include: { box: true },
  });

  if (!item) notFound();

  const catalogNumber = `${item.box.code}-${item.evidNumber}`;
  const weightG = Number(item.weight);
  const weightCt = Number(item.weightCt) || (weightG * 5);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Verified Authentic
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Certificate of Authenticity</h1>
          <p className="text-gray-500">Bohemian Moldavite</p>
        </div>

        {/* 360° Viewer - compact, same width as content */}
        {item.photoPath && (
          <div className="mb-8 max-w-sm mx-auto">
            <StoneViewer360
              photoPath={item.photoPath}
              evidNumber={catalogNumber}
              itemId={item.id}
              mainPhoto={item.mainPhoto}
              readOnly
            />
          </div>
        )}

        {/* Details */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Specimen Details</h2>

          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div className="text-gray-500">Certificate Number</div>
            <div className="font-mono font-medium">{catalogNumber}</div>

            {(item.nameEn || item.name) && (
              <>
                <div className="text-gray-500">Name</div>
                <div className="font-medium">{item.nameEn || item.name}</div>
              </>
            )}

            <div className="text-gray-500">Mineral Species</div>
            <div>Tektite</div>

            <div className="text-gray-500">Variety</div>
            <div>Moldavite (Vltavín)</div>

            <div className="text-gray-500">Origin</div>
            <div>Southern Bohemia, Czech Republic</div>

            <div className="text-gray-500">Locality</div>
            <div>{item.location ? `${item.location} - Czech Republic` : 'Czech Republic'}</div>

            <div className="text-gray-500">Weight</div>
            <div className="font-medium">{weightG.toFixed(2)} g / {weightCt.toFixed(2)} ct</div>
          </div>
        </div>

        {/* Description */}
        {(item.descriptionEn || item.description) && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3 text-gray-800">Description</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {item.descriptionEn || item.description}
            </p>
          </div>
        )}

        {/* Declaration */}
        <div className="bg-green-50 rounded-xl border border-green-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3 text-green-900">Declaration of Authenticity</h2>
          <p className="text-sm text-green-800 leading-relaxed">
            This document confirms that the specimen described above is a 100% natural Moldavite,
            a unique glass tektite formed approximately 14.7 million years ago during a meteorite
            impact in Southern Germany. This gemstone was legally sourced from the renowned localities
            of the Bohemian Moldavite Field in the Czech Republic. It is guaranteed to be untreated,
            unheated, and free of any synthetic enhancements.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400">
          <p>Issued by Bohemian Moldavite</p>
          <p className="mt-1">Verification ID: {hash}</p>
        </div>
      </div>
    </div>
  );
}
