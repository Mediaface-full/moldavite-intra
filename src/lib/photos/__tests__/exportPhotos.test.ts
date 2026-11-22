import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { exportPhotoPaths } from '@/lib/photos/exportPhotos';

let root: string;
const P = 'K0001/0001-0005/0001';
const e = (file: string, status: string) => ({ file, status, score: 0.9, model: 'm', createdAt: '' });
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bm-export-'));
  mkdirSync(path.join(root, P, 'ai'), { recursive: true });
  for (let n = 1; n <= 24; n++) writeFileSync(path.join(root, P, `${String(n).padStart(2, '0')}.jpg`), 'x');
  writeFileSync(path.join(root, P, 'ai', '01-aaaaaaaa.jpg'), 'x');
  process.env.PHOTOS_PATH = root; process.env.PHOTOS_WEB_PATH = '';
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('exportPhotoPaths — stejné fotky jako e-shop', () => {
  const item = { photoPath: P, mainPhoto: 1, shopPhotos: [] as number[], aiPhotos: { 1: e('01-aaaaaaaa.jpg', 'ok'), 4: e('04-bbbbbbbb.jpg', 'suspect'), 7: e('07-cccccccc.jpg', 'approved') } };
  it('webp (Upgates): max 4, AI verze kde je použitelná a soubor existuje, jinak originál', () => {
    expect(exportPhotoPaths(item, 'webp')).toEqual([`${P}/ai/01-aaaaaaaa.webp`, `${P}/04.webp`, `${P}/07.webp`, `${P}/13.webp`]);
  });
  it('jpg (CSV pro Etsy)', () => {
    expect(exportPhotoPaths(item, 'jpg')).toEqual([`${P}/ai/01-aaaaaaaa.jpg`, `${P}/04.jpg`, `${P}/07.jpg`, `${P}/13.jpg`]);
  });
  it('ruční výběr se respektuje; bez fotek → nic', () => {
    expect(exportPhotoPaths({ ...item, shopPhotos: [20] }, 'webp')).toEqual([`${P}/ai/01-aaaaaaaa.webp`, `${P}/20.webp`]);
    expect(exportPhotoPaths({ ...item, photoPath: '' }, 'webp')).toEqual([]);
  });
});
