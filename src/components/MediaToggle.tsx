'use client';

import { useState } from 'react';
import VideoPlayer from './VideoPlayer';

export default function MediaToggle({ photoPath, catalogNumber }: { photoPath: string; catalogNumber: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        className="bg-muted border border-border hover:border-foreground/40 text-muted-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Film a Video
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Film (flim.jpg)</h3>
            <div className="rounded-xl overflow-hidden border border-border bg-white max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/${photoPath}/flim.jpg`} alt={`Film ${catalogNumber}`} className="w-full object-contain" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Video</h3>
            <VideoPlayer photoPath={photoPath} evidNumber={catalogNumber} />
          </div>
        </div>
      )}
    </div>
  );
}
