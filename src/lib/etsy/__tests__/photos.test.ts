import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import { etsyPhotoPlan, etsyPhotoJpeg } from '@/lib/etsy/photos';

let root: string;
const P = 'K0001/0001-0005/0001';
const e = (file: string, status: string) => ({ file, status, score: 0.9, model: 'm', createdAt: '' });

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'bm-etsy-photos-'));
  mkdirSync(path.join(root, P, 'ai'), { recursive: true });
  for (let n = 1; n <= 24; n++) writeFileSync(path.join(root, P, `${String(n).padStart(2, '0')}.jpg`), 'x');
  writeFileSync(path.join(root, P, 'ai', '01-aaaaaaaa.jpg'), 'x');
  writeFileSync(path.join(root, P, 'ai', '04-bbbbbbbb.jpg'), 'x');
  await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#ffffff' } }).png().toFile(path.join(root, P, 'big.png'));
  process.env.PHOTOS_PATH = root;
  process.env.PHOTOS_WEB_PATH = '';
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('etsyPhotoPlan', () => {
  it('24 slotů → 1, 4, 7, 13 (stejně jako e-shop)', () => {
    expect(etsyPhotoPlan({ photoPath: P, mainPhoto: 1, shopPhotos: [], aiPhotos: null }).map((x) => x.slot)).toEqual([1, 4, 7, 13]);
  });
  it('AI ok → ai soubor; suspect → originál', () => {
    const plan = etsyPhotoPlan({ photoPath: P, mainPhoto: 1, shopPhotos: [], aiPhotos: { 1: e('01-aaaaaaaa.jpg', 'ok'), 4: e('04-bbbbbbbb.jpg', 'suspect') } });
    expect(plan[0]).toMatchObject({ slot: 1, ai: true });
    expect(plan[0].file.endsWith(path.join('ai', '01-aaaaaaaa.jpg'))).toBe(true);
    expect(plan[1]).toMatchObject({ slot: 4, ai: false });
    expect(plan[1].file.endsWith('04.jpg')).toBe(true);
  });
  it('AI ok, ale soubor chybí → originál', () => {
    const plan = etsyPhotoPlan({ photoPath: P, mainPhoto: 1, shopPhotos: [], aiPhotos: { 7: e('07-cccccccc.jpg', 'ok') } });
    expect(plan[2]).toMatchObject({ slot: 7, ai: false });
  });
});

describe('etsyPhotoJpeg', () => {
  it('4000×4000 PNG → JPEG, delší strana 3000', async () => {
    const buf = await etsyPhotoJpeg({ slot: 1, file: path.join(root, P, 'big.png'), ai: false });
    expect(buf[0]).toBe(0xff); expect(buf[1]).toBe(0xd8);
    const meta = await sharp(buf).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(3000);
  });
});
