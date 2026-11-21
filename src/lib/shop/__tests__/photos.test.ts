/**
 * diskPhotoResolver — musí nabídnout přesně ty fotky, které /images route vydá (5. 10. 2026: první verze
 * hledala jen v originálech a na produkci vrátila 0 fotek u všech kamenů).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { diskPhotoResolver } from '@/lib/shop/catalog';

const BASE = 'https://app.example.com';
const P = 'K0001/0001-0005/0001';
let orig: string, web: string;

function touch(root: string, rel: string) {
  const f = path.join(root, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, 'x');
}

beforeAll(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'bm-photos-'));
  orig = path.join(tmp, 'FOTO_MOLDAVITE');
  web = path.join(tmp, 'FOTO_MOLDAVITE_web');
  mkdirSync(orig); mkdirSync(web);
  touch(web, `${P}/01.jpg`); touch(web, `${P}/02.jpg`);   // jen webová varianta (jako produkce)
  touch(orig, `${P}/03.png`);                              // jen originál
  touch(orig, `${P}/05.webp`);                             // hotový webp
  touch(orig, `${P}/notes.txt`); touch(orig, `${P}/07.gif`); // nevydává se jako slot
  touch(web, `${P}/video.mp4`);
  touch(path.dirname(orig), 'secret/01.jpg');              // mimo kořen
});
afterAll(() => rmSync(path.dirname(orig), { recursive: true, force: true }));

describe('diskPhotoResolver', () => {
  it('najde sloty v obou kořenech (web varianta i originál), URL jako .webp, video', () => {
    const r = diskPhotoResolver(BASE, orig, web)(P, 1);
    expect(r.photos).toEqual(['01', '02', '03', '05'].map((n) => `${BASE}/images/${P}/${n}.webp`));
    expect(r.video).toBe(`${BASE}/images/${P}/video.mp4`);
  });
  it('bez PHOTOS_WEB_PATH vidí jen originály', () => {
    expect(diskPhotoResolver(BASE, orig, '')(P, 1).photos.map((u) => u.slice(-7))).toEqual(['03.webp', '05.webp']);
  });
  it('hlavní fotka první; neexistující mainPhoto → první slot', () => {
    expect(diskPhotoResolver(BASE, orig, web)(P, 3).photos[0]).toMatch(/03\.webp$/);
    expect(diskPhotoResolver(BASE, orig, web)(P, 9).photos[0]).toMatch(/01\.webp$/);
  });
  it('celá otočka 24 fotek → max 4 z různých úhlů, hlavní první', () => {
    const R = 'K0002/0001-0005/0002';
    for (let n = 1; n <= 24; n++) touch(orig, `${R}/${String(n).padStart(2, '0')}.jpg`);
    const r = diskPhotoResolver(BASE, orig, web)(R, 1);
    expect(r.photos.map((u) => u.slice(-7))).toEqual(['01.webp', '04.webp', '07.webp', '13.webp']);
    expect(diskPhotoResolver(BASE, orig, web)(R, 2, { shopPhotos: [20, 2] }).photos.map((u) => u.slice(-7))).toEqual(['02.webp', '20.webp']);
  });
  it('AI úprava: ok/approved → ai/…webp, suspect → originál, chybějící soubor → originál', () => {
    const R = 'K0003/0001-0005/0003';
    for (let n = 1; n <= 24; n++) touch(orig, `${R}/${String(n).padStart(2, '0')}.jpg`);
    touch(orig, `${R}/ai/01-aaaaaaaa.jpg`); touch(orig, `${R}/ai/04-bbbbbbbb.jpg`); touch(orig, `${R}/ai/07-cccccccc.jpg`);
    const e = (file: string, status: string) => ({ file, status, score: 0.9, model: 'm', createdAt: '' });
    const aiPhotos = {
      1: e('01-aaaaaaaa.jpg', 'ok'), 4: e('04-bbbbbbbb.jpg', 'suspect'), 7: e('07-cccccccc.jpg', 'approved'),
      13: e('13-dddddddd.jpg', 'ok'), // soubor neexistuje
    };
    const r = diskPhotoResolver(BASE, orig, web)(R, 1, { aiPhotos });
    expect(r.photos.map((u) => u.split(`${R}/`)[1])).toEqual(['ai/01-aaaaaaaa.webp', '04.webp', 'ai/07-cccccccc.webp', '13.webp']);
  });
  it('traversal a prázdná cesta → nic', () => {
    const res = diskPhotoResolver(BASE, orig, web);
    for (const bad of ['', '../secret', 'K0001/../../secret', 'a\\b', 'a\0b']) {
      expect(res(bad, 1)).toEqual({ photos: [], video: null });
    }
  });
  it('mezery a diakritika v cestě se v URL kódují', () => {
    touch(web, 'K 2/Ježek/01.jpg');
    expect(diskPhotoResolver(BASE, orig, web)('K 2/Ježek', 1).photos[0]).toBe(`${BASE}/images/K%202/Je%C5%BEek/01.webp`);
  });
});
