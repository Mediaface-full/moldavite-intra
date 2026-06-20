import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunkText';

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const text = 'Moldavity jsou tektity. Vznikly před 14.7 mil. let.';
    const chunks = chunkText(text, []);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[0].charEnd).toBe(text.length);
    expect(chunks[0].pageHint).toBeNull();
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it('splits long text into multiple chunks with overlap', () => {
    // Generate ~2000 slov to force 2+ chunks (chunkSize=700, overlap=150)
    const sentence = 'Moldavity byly nalezeny v lokalite Marouskovo Pole. ';
    const text = sentence.repeat(400); // ~2000 slov
    const chunks = chunkText(text, [], { chunkSize: 700, overlap: 150 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[1].charStart).toBeLessThan(chunks[0].charEnd); // overlap
    expect(chunks[1].charStart).toBeGreaterThan(0);
  });

  it('charStart/charEnd accurately maps back to original text', () => {
    const text = 'Veta jedna. Veta dve. Veta tri. Veta ctyri. Veta pet.';
    const chunks = chunkText(text, []);
    for (const chunk of chunks) {
      const slice = text.slice(chunk.charStart, chunk.charEnd);
      // chunk.text moze byt rozdilny jen ohledne edge whitespace
      expect(slice.includes(chunk.text.slice(0, 20).trim().split('.')[0])).toBe(true);
    }
  });

  it('assigns pageHint from nearest preceding ChapterMarker', () => {
    const text = 'A'.repeat(1000) + 'B'.repeat(1000) + 'C'.repeat(1000);
    const chapters = [
      { offset: 0, label: 'Kapitola 1' },
      { offset: 1000, label: 'Kapitola 2' },
      { offset: 2000, label: 'Kapitola 3' },
    ];
    const chunks = chunkText(text, chapters, { chunkSize: 100, overlap: 20 });

    // First chunk pageHint = Kapitola 1
    expect(chunks[0].pageHint).toBe('Kapitola 1');
    // Find chunk that starts >= 2000 (Kapitola 3)
    const ch3 = chunks.find((c) => c.charStart >= 2000);
    expect(ch3?.pageHint).toBe('Kapitola 3');
  });

  it('respects sentence boundaries when possible', () => {
    // Use exactly the words available; chunkSize=10 forces multiple chunks
    const text = 'Veta jedna. Veta dva. Veta tri. Veta ctyri.';
    const chunks = chunkText(text, [], { chunkSize: 4, overlap: 1 });
    // Each chunk should end at sentence boundary if possible (after .)
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.text.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('empty input returns empty array', () => {
    expect(chunkText('', [])).toEqual([]);
    expect(chunkText('   ', [])).toEqual([]);
  });
});
