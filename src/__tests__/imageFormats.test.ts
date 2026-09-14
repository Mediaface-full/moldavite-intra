import { describe, it, expect } from 'vitest';
import { isWebpRequest, webpSourceCandidates, WEBP_MAX_WIDTH } from '@/lib/imageFormats';

describe('imageFormats — on-demand WebP fallback', () => {
  it('rozpozná .webp požadavek (case-insensitive)', () => {
    expect(isWebpRequest(['K0001', '0001', '01.webp'])).toBe(true);
    expect(isWebpRequest(['K0001', '0001', '01.WEBP'])).toBe(true);
    expect(isWebpRequest(['K0001', '0001', '01.jpg'])).toBe(false);
    expect(isWebpRequest([])).toBe(false);
  });

  it('vrátí kandidáty jpg/jpeg/png se stejným stem a cestou', () => {
    expect(webpSourceCandidates(['K0001', '0001-0005', '0003', '01.webp'])).toEqual([
      ['K0001', '0001-0005', '0003', '01.jpg'],
      ['K0001', '0001-0005', '0003', '01.jpeg'],
      ['K0001', '0001-0005', '0003', '01.png'],
    ]);
  });

  it('pro ne-webp požadavek nevrací nic', () => {
    expect(webpSourceCandidates(['K0001', '01.jpg'])).toEqual([]);
    expect(webpSourceCandidates(['K0001', 'video.mp4'])).toEqual([]);
  });

  it('nezmění nic kromě přípony (žádné traversal segmenty nevznikají)', () => {
    const c = webpSourceCandidates(['K0001', 'flim.webp']);
    expect(c.every((s) => s.length === 2 && s[0] === 'K0001' && s[1].startsWith('flim.'))).toBe(true);
  });

  it('WEBP_MAX_WIDTH odpovídá web variantě (1920)', () => {
    expect(WEBP_MAX_WIDTH).toBe(1920);
  });
});
