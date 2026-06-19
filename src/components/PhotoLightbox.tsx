'use client';

/**
 * Fullscreen lightbox pro prohlížení fotek (controlled component).
 * - Backdrop blur, fotka centrovaná, max 90% viewport
 * - Navigation: ← → klávesa, klik na šipky
 * - ESC nebo klik mimo → zavře (onClose)
 * - Counter „3 / 8"
 * - Podporuje PDF (iframe) i obrázky
 *
 * Použití:
 *   const [idx, setIdx] = useState<number | null>(null);
 *   <PhotoLightbox photos={['url1', 'url2']} index={idx} onIndexChange={setIdx} onClose={() => setIdx(null)} />
 *   <img onClick={() => setIdx(0)} ... />
 */
import { useEffect } from 'react';
import Icon from './Icon';

export default function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  alt = 'Foto',
}: {
  photos: string[];
  /** Aktuální index. null = lightbox zavřený. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  alt?: string;
}) {
  const isOpen = index !== null;
  const total = photos.length;

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (total <= 1 || index === null) return;
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + total) % total);
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % total);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, index, total, onClose, onIndexChange]);

  if (!isOpen || index === null) return null;
  const current = photos[index];
  if (!current) return null;

  const isPdf = current.toLowerCase().endsWith('.pdf');
  const goPrev = () => onIndexChange((index - 1 + total) % total);
  const goNext = () => onIndexChange((index + 1) % total);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors z-10"
        title="Zavřít (ESC)"
      >
        <Icon name="x" className="w-5 h-5" />
      </button>

      {total > 1 && (
        <div className="absolute top-4 left-4 text-white/80 font-mono text-sm tabular-nums bg-black/40 px-3 py-1.5 rounded-full">
          {index + 1} / {total}
        </div>
      )}

      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
          title="Předchozí (←)"
        >
          <Icon name="arrow-left" className="w-6 h-6" />
        </button>
      )}

      <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isPdf ? (
          <iframe
            src={`/images/${current}`}
            className="w-[90vw] h-[90vh] bg-white rounded-lg"
            title={alt}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/images/${current}`}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>

      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
          title="Další (→)"
        >
          <Icon name="arrow-right" className="w-6 h-6" />
        </button>
      )}

      <a
        href={`/images/${current}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-4 text-white/60 hover:text-white text-xs font-mono uppercase tracking-wider bg-black/40 px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1.5"
        title="Otevřít v nové záložce / stáhnout"
      >
        <Icon name="external" className="w-3.5 h-3.5" />
        Otevřít
      </a>
    </div>
  );
}
