'use client';

import { getVideoUrl } from '@/lib/utils';

interface VideoPlayerProps {
  photoPath: string;
  evidNumber: string;
}

export default function VideoPlayer({ photoPath, evidNumber }: VideoPlayerProps) {
  const videoUrl = getVideoUrl(photoPath);

  return (
    <div className="rounded-xl overflow-hidden bg-muted">
      <div className="relative" style={{ maxHeight: '400px' }}>
        <video
          controls
          className="w-full max-h-[400px] object-contain bg-black"
          preload="metadata"
        >
          <source src={videoUrl} type="video/mp4" />
          Váš prohlížeč nepodporuje přehrávání videa.
        </video>
      </div>
      <div className="px-4 py-2 text-sm text-muted-foreground">
        Video - {evidNumber}
      </div>
    </div>
  );
}
