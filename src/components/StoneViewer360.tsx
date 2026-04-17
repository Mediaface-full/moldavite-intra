'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { get360Photos, getGifUrl } from '@/lib/utils';

interface StoneViewer360Props {
  photoPath: string;
  evidNumber: string;
  itemId: number;
  mainPhoto: number; // 1-24
  readOnly?: boolean;
}

export default function StoneViewer360({ photoPath, evidNumber, itemId, mainPhoto, readOnly }: StoneViewer360Props) {
  const [currentIndex, setCurrentIndex] = useState(mainPhoto - 1);
  const [currentMainPhoto, setCurrentMainPhoto] = useState(mainPhoto);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastX = useRef(0);

  const photos = useMemo(() => get360Photos(photoPath), [photoPath]);
  const gifUrl = useMemo(() => getGifUrl(photoPath), [photoPath]);

  useEffect(() => {
    let loadedCount = 0;
    const total = photos.length;
    for (const src of photos) {
      const img = new window.Image();
      img.onload = () => { loadedCount++; if (loadedCount === total) setIsLoaded(true); };
      img.onerror = () => { loadedCount++; if (loadedCount === total) setIsLoaded(true); };
      img.src = src;
    }
  }, [photos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    lastX.current = e.clientX;
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - lastX.current;
    if (Math.abs(delta) > 15) {
      setCurrentIndex((prev) => (prev + (delta > 0 ? 1 : -1) + 24) % 24);
      lastX.current = e.clientX;
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    lastX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - lastX.current;
    if (Math.abs(delta) > 15) {
      setCurrentIndex((prev) => (prev + (delta > 0 ? 1 : -1) + 24) % 24);
      lastX.current = e.touches[0].clientX;
    }
  }, [isDragging]);

  const setAsMainPhoto = async () => {
    const photoNumber = currentIndex + 1;
    setSaving(true);
    try {
      await fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainPhoto: photoNumber }),
      });
      setCurrentMainPhoto(photoNumber);
    } catch (err) {
      console.error('Failed to set main photo:', err);
    } finally {
      setSaving(false);
    }
  };

  const isCurrentMain = currentIndex + 1 === currentMainPhoto;

  return (
    <div className="relative">
      <div
        className="relative w-full aspect-square bg-white rounded-xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      >
        {isLoaded ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photos[currentIndex]}
            alt={`Moldavit ${evidNumber} - ${currentIndex + 1}/24`}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={gifUrl}
            alt={`Moldavit ${evidNumber}`}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        )}

        {/* Arrow buttons */}
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev - 1 + 24) % 24); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev + 1) % 24); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Bottom bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none z-10">
          <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <span>{String(currentIndex + 1).padStart(2, '0')}/24</span>
          </div>

          {isCurrentMain && (
            <div className="bg-accent-gold/80 text-black text-xs px-3 py-1.5 rounded-full font-medium">
              Hlavni foto
            </div>
          )}
        </div>
      </div>

      {/* Controls under viewer */}
      <div className="mt-3">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {photos.map((src, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`flex-shrink-0 w-10 h-10 rounded border-2 overflow-hidden transition-colors relative ${
                index === currentIndex
                  ? 'border-accent-gold'
                  : index + 1 === currentMainPhoto
                  ? 'border-accent-gold/50'
                  : 'border-border-color hover:border-border-hover'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${index + 1}`} className="object-cover w-full h-full" loading="lazy" />
              {index + 1 === currentMainPhoto && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 bg-accent-gold rounded-full" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Set main photo button */}
        {!readOnly && <div className="flex justify-end">
          <button
            onClick={setAsMainPhoto}
            disabled={saving || isCurrentMain}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isCurrentMain
                ? 'bg-accent-gold/20 text-accent-gold cursor-default'
                : 'bg-bg-secondary border border-border-color hover:border-accent-gold text-text-secondary hover:text-accent-gold'
            }`}
          >
          <svg className="w-3.5 h-3.5" fill={isCurrentMain ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
            {saving ? '...' : isCurrentMain ? 'Hlavni' : 'Nastavit hlavni'}
          </button>
        </div>}
      </div>
    </div>
  );
}
