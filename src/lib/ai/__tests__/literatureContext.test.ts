import { describe, it, expect } from 'vitest';
import {
  buildLiteratureQuery, selectChunks, formatLiteratureContext, injectContext, CONTEXT_TAG, MIN_SIMILARITY,
  longestCommonWordRun, maxOverlapWithChunks,
} from '../literatureContext';
import type { RetrievedChunk } from '@/lib/vseved/types';

const chunk = (over: Partial<RetrievedChunk>): RetrievedChunk => ({
  id: 1, documentId: 1, documentTitle: 'Vltavíny', documentAuthor: 'Bouška', documentYear: 1994,
  chunkIndex: 0, text: 'Besednice je proslulá ježatými vltavíny s hlubokou skulptací.', pageHint: null, similarity: 0.8,
  ...over,
});

describe('buildLiteratureQuery', () => {
  it('lokalita a tvar jsou v dotazu, prázdné atributy se vynechají', () => {
    const q = buildLiteratureQuery({ location: 'Besednice', shapeCz: 'Kapka', attrColor: [], weightGrams: '5.68' });
    expect(q).toContain('Besednice');
    expect(q).toContain('Kapka');
    expect(q).not.toContain('barva');
    expect(q).toContain('střední velikost');
  });
  it('bez atributů obecný dotaz na vltavíny', () => {
    expect(buildLiteratureQuery({})).toBe('vltavín moldavit');
  });
});

describe('selectChunks', () => {
  it('vyhodí šum pod prahem a ořízne na topK', () => {
    const out = selectChunks([
      chunk({ id: 1, similarity: 0.9 }), chunk({ id: 2, similarity: MIN_SIMILARITY - 0.01 }), chunk({ id: 3, similarity: 0.7 }),
    ], 2);
    expect(out.map((c) => c.id)).toEqual([1, 3]);
  });
  it('dlouhou pasáž zkrátí na hranici slova', () => {
    const long = chunk({ text: 'slovo '.repeat(400) });
    const [c] = selectChunks([long]);
    expect(c.text.length).toBeLessThanOrEqual(901);
    expect(c.text.endsWith('…')).toBe(true);
  });
});

describe('longestCommonWordRun / maxOverlapWithChunks', () => {
  it('ignoruje velikost písmen, interpunkci a HTML', () => {
    const src = 'Kameny odtud mají výrazně hlubokou, takzvanou ježatou skulptaci.';
    // shodný sled: „výrazně hlubokou takzvanou ježatou skulptaci" = 5 slov
    expect(longestCommonWordRun('<p>známé pro svou výrazně hlubokou, takzvanou ježatou skulptaci!</p>', src)).toBe(5);
    expect(longestCommonWordRun('úplně jiný text', src)).toBe(0);
  });
  it('vrací maximum přes všechny texty a pasáže', () => {
    const chunks = [chunk({ text: 'alfa beta gama delta' }), chunk({ id: 2, text: 'jedna dva tři čtyři pět šest' })];
    expect(maxOverlapWithChunks(['nic', 'x jedna dva tři čtyři y'], chunks)).toBe(4);
    expect(maxOverlapWithChunks([], chunks)).toBe(0);
  });
});

describe('formatLiteratureContext + injectContext', () => {
  it('bez pasáží prompt nemění a značku odstraní', () => {
    expect(formatLiteratureContext([])).toBe('');
    expect(injectContext(`A ${CONTEXT_TAG} B`, '')).toBe('A  B');
    expect(injectContext('A B', '')).toBe('A B');
  });
  it('blok obsahuje zákaz opisování a jde na místo značky, jinak před prompt', () => {
    const block = formatLiteratureContext([chunk({})]);
    expect(block).toContain('neopisuj');
    expect(block).toContain('[1] Besednice');
    expect(injectContext(`Napiš popis. ${CONTEXT_TAG}`, block)).toBe(`Napiš popis. ${block}`);
    expect(injectContext('Napiš popis.', block).startsWith(block)).toBe(true);
  });
});
