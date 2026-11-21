import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { stoneMask, silhouetteScore, composeSet, CANVAS, SCORE_OK } from '@/lib/photos/stoneImage';

/** Zelený „kámen“ (elipsa) na světlém pozadí, se světle šedým stínem pod ním. */
async function photo(opts: { size?: number; cx: number; cy: number; rx: number; ry: number; bg?: string }) {
  const size = opts.size ?? 800;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="${opts.bg ?? '#fbf9f4'}"/>
    <ellipse cx="${opts.cx}" cy="${opts.cy + opts.ry + 8}" rx="${opts.rx}" ry="10" fill="#dddbd6"/>
    <ellipse cx="${opts.cx}" cy="${opts.cy}" rx="${opts.rx}" ry="${opts.ry}" fill="#4f6b45"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe('stoneImage', () => {
  it('maska najde kámen, stín pod ním nepočítá', async () => {
    const m = await stoneMask(await photo({ cx: 400, cy: 400, rx: 200, ry: 100 }));
    const bb = m.bbox!;
    expect(bb.w * m.scale).toBeGreaterThan(380);
    expect(bb.w * m.scale).toBeLessThan(420);
    expect(bb.h * m.scale).toBeLessThan(215); // bez stínu (ten by přidal ~20 px)
  });
  it('stejný tvar jinde a jinak velký → vysoká shoda; jiný tvar → nízká', async () => {
    const a = await stoneMask(await photo({ cx: 400, cy: 400, rx: 200, ry: 100 }));
    const same = await stoneMask(await photo({ cx: 350, cy: 450, rx: 300, ry: 150, bg: '#ffffff' }));
    const other = await stoneMask(await photo({ cx: 400, cy: 400, rx: 60, ry: 160 }));
    expect(silhouetteScore(a, same)).toBeGreaterThan(SCORE_OK);
    expect(silhouetteScore(a, other)).toBeLessThan(0.5);
  });
  it('prázdná fotka → shoda 0', async () => {
    const blank = await stoneMask(await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer());
    expect(blank.bbox).toBeNull();
    expect(silhouetteScore(blank, blank)).toBe(0);
  });
  it('composeSet: 2048×2048, kámen na středu, společné měřítko (poměr velikostí zachován)', async () => {
    const out = await composeSet([
      await photo({ cx: 250, cy: 300, rx: 200, ry: 100 }),
      await photo({ cx: 500, cy: 500, rx: 50, ry: 100 }),
    ]);
    const [m1, m2] = await Promise.all(out.map((b) => stoneMask(b)));
    for (const b of out) {
      const meta = await sharp(b).metadata();
      expect([meta.width, meta.height]).toEqual([CANVAS, CANVAS]);
    }
    const center = (m: typeof m1) => [(m.bbox!.x + m.bbox!.w / 2) * m.scale, (m.bbox!.y + m.bbox!.h / 2) * m.scale];
    for (const c of [center(m1), center(m2)]) { expect(Math.abs(c[0] - CANVAS / 2)).toBeLessThan(40); expect(Math.abs(c[1] - CANVAS / 2)).toBeLessThan(40); }
    const w1 = m1.bbox!.w * m1.scale, w2 = m2.bbox!.w * m2.scale;
    expect(w1 / CANVAS).toBeGreaterThan(0.68); expect(w1 / CANVAS).toBeLessThan(0.76); // největší pohled = 72 %
    expect(w1 / w2).toBeGreaterThan(3.5); expect(w1 / w2).toBeLessThan(4.5);             // 400 px vs 100 px
  });
});
