'use client';

export default function BoxPhotoPreview({ photos }: { photos: string[] }) {
  if (!photos || photos.length === 0) return null;

  return (
    <div className="flex gap-1 mb-3">
      {photos.slice(0, 4).map((photo, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(`/images/${photo}`, '_blank');
          }}
          className="w-14 h-14 rounded overflow-hidden border border-border-color bg-white flex items-center justify-center hover:border-moldavite-500 transition-colors"
        >
          {photo.endsWith('.pdf') ? (
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/images/${photo}`} alt="" className="w-full h-full object-cover" />
          )}
        </button>
      ))}
    </div>
  );
}
