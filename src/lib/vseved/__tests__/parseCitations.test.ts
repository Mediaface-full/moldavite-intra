import { describe, it, expect } from 'vitest';
import { parseCitations } from '../chat';
import type { RetrievedChunk } from '../types';

const fixtureChunks: RetrievedChunk[] = [
  { id: 1, documentId: 10, documentTitle: 'Moldavity', documentAuthor: 'Bouška', documentYear: 1968, chunkIndex: 0, text: '...', pageHint: 'Kap. 1', similarity: 0.9 },
  { id: 2, documentId: 10, documentTitle: 'Moldavity', documentAuthor: 'Bouška', documentYear: 1968, chunkIndex: 1, text: '...', pageHint: 'Kap. 2', similarity: 0.85 },
  { id: 3, documentId: 11, documentTitle: 'Tektites', documentAuthor: 'Glass', documentYear: 2002, chunkIndex: 0, text: '...', pageHint: null, similarity: 0.7 },
];

describe('parseCitations', () => {
  it('extracts citations matching author + year', () => {
    const response = 'Moldavity vznikly před 14.7 mil. let [Bouška, 1968, Kap. 1]. Glass to potvrzuje [Glass, 2002].';
    const ids = parseCitations(response, fixtureChunks);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
  });

  it('returns empty for response without citations', () => {
    const response = 'Moldavity jsou krásné kameny bez jakékoli citace.';
    expect(parseCitations(response, fixtureChunks)).toEqual([]);
  });

  it('matches both kap. label and chunk index format', () => {
    const response = 'Viz [Bouška, 1968, Kap. 2].';
    const ids = parseCitations(response, fixtureChunks);
    expect(ids).toContain(2);
  });

  it('dedup: same chunk cited twice = once in result', () => {
    const response = '[Bouška, 1968, Kap. 1] potvrzuje [Bouška, 1968, Kap. 1].';
    const ids = parseCitations(response, fixtureChunks);
    expect(ids).toEqual([1]);
  });

  it('ignores citations not matching any retrieved chunk', () => {
    const response = '[Neznamy, 2099].';
    expect(parseCitations(response, fixtureChunks)).toEqual([]);
  });
});
