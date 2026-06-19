'use client';

import { useState, useEffect } from 'react';

/**
 * Drop-in nahrazení <img> — při onError ukáže placeholder místo broken icon.
 * Pro statické assety (loga apod.) není potřeba, ty existují vždy. Použij
 * jen pro user-content fotky (FTP photoPath, upload, /images/*).
 *
 * Varianty placeholderu:
 *   - 'minimal' — jen šedý čtverec s tečkou (pro thumbnaily 40px+)
 *   - 'iconLabel' — ikona + popisek (default, pro >120px)
 */
type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onError'> & {
  src: string;
  placeholder?: 'minimal' | 'iconLabel';
  placeholderLabel?: string;
};

export default function SafeImage({
  src,
  alt = '',
  className,
  placeholder = 'iconLabel',
  placeholderLabel,
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);

  // Reset failure state if src changes (e.g. parent swaps to a new photo path).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    if (placeholder === 'minimal') {
      return (
        <div className={`flex items-center justify-center bg-muted/40 ${className ?? ''}`}>
          <span className="text-[10px] font-mono text-muted-foreground select-none">—</span>
        </div>
      );
    }
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 select-none ${className ?? ''}`}
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--muted) 60%, transparent), color-mix(in srgb, var(--muted) 30%, transparent))',
        }}
      >
        <svg
          className="w-10 h-10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          style={{ color: 'color-mix(in srgb, var(--muted-foreground) 50%, transparent)' }}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        {placeholderLabel && (
          <p className="text-[10px] font-mono text-muted-foreground text-center px-2">{placeholderLabel}</p>
        )}
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
