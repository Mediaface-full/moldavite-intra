import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { shopPhotoStats } from '@/lib/photos/missing';

let root: string;
const P = 'K0001/0001-0005/0001';
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bm-missing-'));
  mkdirSync(path.join(root, P), { recursive: true });
  for (let n = 1; n <= 24; n++) writeFileSync(path.join(root, P, `${String(n).padStart(2, '0')}.jpg`), 'x');
  process.env.PHOTOS_PATH = root;
  process.env.PHOTOS_WEB_PATH = '';
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const e = (file: string, status: string) => ({ file, status, score: 0.5, model: 'm', createdAt: '' });

describe('shopPhotoStats — co chybí k AI úpravě', () => {
  it('bez AI chybí všechny 4 e-shopové fotky', () => {
    expect(shopPhotoStats({ photoPath: P, mainPhoto: 1, shopPhotos: [], aiPhotos: null }).missing).toEqual([1, 4, 7, 13]);
  });
  it('ok / suspect / approved / rejected se jako chybějící NEpočítají (zamítnutou hromadný běh nepřegeneruje)', () => {
    const aiPhotos = { 1: e('01-aaaaaaaa.jpg', 'ok'), 4: e('04-bbbbbbbb.jpg', 'suspect'), 7: e('07-cccccccc.jpg', 'rejected') };
    expect(shopPhotoStats({ photoPath: P, mainPhoto: 1, shopPhotos: [], aiPhotos }).missing).toEqual([13]);
  });
});
