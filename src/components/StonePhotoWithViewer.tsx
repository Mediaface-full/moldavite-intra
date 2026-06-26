'use client';

/**
 * StonePhotoWithViewer — light-weight wrapper kolem StoneViewer360.
 *
 * Na detailu kamene se defaultně ukazuje JEN hlavní fotka (1 image lazy-loaded).
 * Tlačítko „Zobrazit 360°" otevře modal s plným viewerem co stahuje všech ~24
 * obrázků (drag rotace + thumbnail bar + „Nastavit hlavní").
 *
 * Důvod: detail kamene s 24 obrázky byl těžký na page load — místo toho
 * defer ke kliknutí uživatele.
 */
import { useState, useMemo } from 'react';
import { get360Photos } from '@/lib/utils';
import SafeImage from './SafeImage';
import StoneViewer360 from './StoneViewer360';
import Icon from './Icon';

export default function StonePhotoWithViewer({
  photoPath,
  evidNumber,
  itemId,
  mainPhoto,
  readOnly,
}: {
  photoPath: string;
  evidNumber: string;
  itemId: number;
  mainPhoto: number;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const photos = useMemo(() => get360Photos(photoPath), [photoPath]);
  const photoCount = photos.length;
  const mainIndex = Math.max(0, (mainPhoto || 1) - 1);
  const mainSrc = photos[mainIndex] ?? photos[0] ?? '';

  return (
    <div className="relative">
      {/* Jen hlavni fotka — 1 image lazy. Klik na ni nebo na tlacitko otevre 360 viewer. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full aspect-square bg-white rounded-xl overflow-hidden cursor-zoom-in group relative"
        title="Otevřít 360° prohlížeč"
      >
        {mainSrc ? (
          <SafeImage
            src={mainSrc}
            alt={`Moldavit ${evidNumber} — hlavní foto`}
            className="absolute inset-0 w-full h-full object-contain"
            placeholder="iconLabel"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Žádné foto
          </div>
        )}
        {/* Hover overlay s ikonou */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-mono">
            <Icon name="merge" className="w-3.5 h-3.5" />
            360°
          </div>
        </div>
        {photoCount > 1 && (
          <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md font-mono">
            {photoCount} fotek
          </div>
        )}
      </button>

      {/* Tlačítko pod fotkou — viditelné na první pohled, ne jen hover */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2"
      >
        <Icon name="merge" className="w-4 h-4" />
        Zobrazit 360° prohlížeč
        {!readOnly && <span className="text-muted-foreground/70 normal-case text-[10px]">· nastav hlavní foto</span>}
      </button>

      {/* Modal s plnym viewerem */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full p-6 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">
                360° prohlížeč — <span className="font-mono">{evidNumber}</span>
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Zavřít"
                title="Zavřít (Esc)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <StoneViewer360
              photoPath={photoPath}
              evidNumber={evidNumber}
              itemId={itemId}
              mainPhoto={mainPhoto}
              readOnly={readOnly}
            />

            <p className="mt-3 text-[11px] text-muted-foreground font-mono">
              Táhni myší / prstem pro rotaci. Klikni na náhled pro skok. {!readOnly && '„Nastavit hlavní" uloží aktuální foto jako hlavní.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
