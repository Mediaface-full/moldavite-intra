'use client';

import { useState, useRef } from 'react';

interface BoxPhotoUploadProps {
  boxId: number;
  boxCode: string;
  existingPhotos: string[];
}

export default function BoxPhotoUpload({ boxId, boxCode, existingPhotos }: BoxPhotoUploadProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos || []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length > 5) {
      alert('Maximálně 5 fotek');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      const res = await fetch(`/api/boxes/${boxId}/photos`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.photos);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    try {
      await fetch(`/api/boxes/${boxId}/photos`, { method: 'DELETE' });
      setPhotos([]);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-sm font-medium text-text-secondary">Fotky krabice</h3>
        <label className="cursor-pointer bg-bg-secondary border border-border-color hover:border-border-hover text-text-primary px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {uploading ? 'Nahrávám...' : 'Nahrát fotky (max 5)'}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
        {photos.length > 0 && (
          <button
            onClick={handleDelete}
            className="text-xs text-text-muted hover:text-red-400 transition-colors"
          >
            Smazat fotky
          </button>
        )}
      </div>

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo, i) => (
            <a key={i} href={`/images/${photo}`} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden border border-border-color bg-white hover:border-moldavite-500 transition-colors">
              {photo.endsWith('.pdf') ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-bg-secondary">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-[10px] text-text-muted mt-1">PDF</span>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/images/${photo}`} alt={`${boxCode} foto ${i + 1}`} className="w-full h-full object-cover" />
              )}
            </a>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-28 h-28 rounded-lg border border-dashed border-border-color bg-bg-secondary flex items-center justify-center">
              <span className="text-text-muted text-xs">{i}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
