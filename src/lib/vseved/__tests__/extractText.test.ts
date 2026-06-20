import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractTxt, extractText } from '../extractText';

describe('extractTxt', () => {
  let tmpDir: string;
  let txtPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'vseved-test-'));
    txtPath = join(tmpDir, 'sample.txt');
    await writeFile(txtPath, 'Moldavity jsou tektity českého původu.\nVznikly před 14.7 milionu let.\n');
  });

  afterAll(async () => {
    try { await unlink(txtPath); } catch {}
  });

  it('reads plain txt, returns text + empty chapters', async () => {
    const result = await extractTxt(txtPath);
    expect(result.text).toContain('Moldavity');
    expect(result.text).toContain('14.7 milionu let');
    expect(result.chapters).toEqual([]);
  });

  it('extractText dispatches to txt extractor for format=txt', async () => {
    const result = await extractText(txtPath, 'txt');
    expect(result.text).toContain('Moldavity');
  });
});
