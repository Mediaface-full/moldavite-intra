'use client';

import { useState, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import PhotoLightbox from './PhotoLightbox';
import SafeImage from './SafeImage';

interface BoxPhotoUploadProps {
  boxId: number;
  boxCode: string;
  existingPhotos: string[];
}

export default function BoxPhotoUpload({ boxId, boxCode, existingPhotos }: BoxPhotoUploadProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length > 5) {
      alert('Maximálně 5 fotek');
      return;
    }

    setUploading(true);
    setUploadError('');
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      const res = await apiFetch(`/api/boxes/${boxId}/photos`, {
        method: 'POST',
        body: formData,
      });
      const text = await res.text();
      let data: { photos?: string[]; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: `HTTP ${res.status} — odpověď nelze parsovat` };
      }
      if (res.ok && data.photos) {
        setPhotos(data.photos);
      } else {
        setUploadError(data.error || `Upload selhal (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload selhal');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/api/boxes/${boxId}/photos`, { method: 'DELETE' });
      setPhotos([]);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Fotky kazety</h3>
        <label className="cursor-pointer bg-muted border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
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
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Smazat fotky
          </button>
        )}
      </div>

      {uploadError && (
        <div className="mb-3 p-3 rounded-lg bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] text-destructive text-sm">
          {uploadError}
        </div>
      )}

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden border border-border bg-white hover:border-ring hover:scale-[1.02] transition-all cursor-zoom-in"
              title={`Otevřít foto ${i + 1} v plné velikosti`}
            >
              {photo.endsWith('.pdf') ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
                  <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-[10px] text-muted-foreground mt-1">PDF</span>
                </div>
              ) : (
                <SafeImage src={`/images/${photo}`} alt={`${boxCode} foto ${i + 1}`} className="w-full h-full object-cover" placeholder="minimal" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-28 h-28 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-xs">{i}</span>
            </div>
          ))}
        </div>
      )}

      <PhotoLightbox
        photos={photos}
        index={lightboxIdx}
        onIndexChange={setLightboxIdx}
        onClose={() => setLightboxIdx(null)}
        alt={`${boxCode} foto`}
      />
    </div>
  );
}
