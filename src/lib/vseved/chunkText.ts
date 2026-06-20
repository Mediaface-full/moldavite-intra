/**
 * Chunking text na ~chunkSize slov s overlap na vetnych hranicich.
 *
 * Strategie:
 * 1. Tokenizace na slova (regex \S+)
 * 2. Per chunk: vezmi chunkSize slov, najdi nejblizsi vetnou hranici
 *    (regex /[.!?]$/) v rozsahu chunkSize-50..chunkSize+50
 * 3. Pokud zadna vetna hranice → fallback na slovo
 * 4. Track originalni char offsets pres index pole slov v textu
 * 5. Overlap: dalsi chunk zacne overlap slov pred koncem
 * 6. pageHint = label nejblizsi predchazejici ChapterMarker
 *
 * tokenCount = approximate 1.3 × word count (Gemini tokenizer heuristics).
 */
import type { Chunk, ChapterMarker } from './types';

export type ChunkOptions = {
  chunkSize?: number; // words per chunk, default 700
  overlap?: number;   // words of overlap between consecutive chunks, default 150
};

export function chunkText(
  text: string,
  chapters: ChapterMarker[],
  options: ChunkOptions = {},
): Chunk[] {
  const chunkSize = options.chunkSize ?? 700;
  const overlap = options.overlap ?? 150;

  if (!text.trim()) return [];

  // Tokenize: find each word with its char offset in original text
  const words: Array<{ word: string; start: number; end: number }> = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (words.length === 0) return [];

  // If text has very few words relative to its length (e.g. no whitespace),
  // fall back to character-based chunking.
  const trimmedText = text.trim();
  const charBased = words.length === 1 && trimmedText.length > chunkSize;

  if (charBased) {
    return chunkByChar(trimmedText, words[0].start, chapters, chunkSize, overlap);
  }

  if (words.length <= chunkSize) {
    // Single chunk
    const charStart = words[0].start;
    const charEnd = words[words.length - 1].end;
    return [
      {
        chunkIndex: 0,
        text: text.slice(charStart, charEnd),
        charStart,
        charEnd,
        pageHint: pageHintFor(charStart, chapters),
        tokenCount: Math.ceil(words.length * 1.3),
      },
    ];
  }

  const chunks: Chunk[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < words.length) {
    const targetEnd = Math.min(cursor + chunkSize, words.length);

    // Find sentence boundary near targetEnd: scan backwards from targetEnd-1
    // for word ending in [.!?]
    let breakIdx = targetEnd;
    if (targetEnd < words.length) {
      const minScan = Math.max(cursor + chunkSize - 50, cursor + 1);
      for (let i = targetEnd - 1; i >= minScan; i--) {
        if (/[.!?]$/.test(words[i].word)) {
          breakIdx = i + 1; // inclusive of this word
          break;
        }
      }
    }
    if (breakIdx <= cursor) breakIdx = targetEnd; // safety

    const charStart = words[cursor].start;
    const charEnd = words[breakIdx - 1].end;
    chunks.push({
      chunkIndex,
      text: text.slice(charStart, charEnd),
      charStart,
      charEnd,
      pageHint: pageHintFor(charStart, chapters),
      tokenCount: Math.ceil((breakIdx - cursor) * 1.3),
    });
    chunkIndex++;

    if (breakIdx >= words.length) break;
    cursor = Math.max(breakIdx - overlap, cursor + 1);
  }

  return chunks;
}

/**
 * Fallback: chunk by character count when text has no whitespace structure.
 * Used for continuous-character text (e.g. test fixtures, binary-ish strings).
 */
function chunkByChar(
  text: string,
  baseOffset: number,
  chapters: ChapterMarker[],
  chunkSize: number,
  overlap: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < text.length) {
    const end = Math.min(cursor + chunkSize, text.length);
    const charStart = baseOffset + cursor;
    const charEnd = baseOffset + end;
    chunks.push({
      chunkIndex,
      text: text.slice(cursor, end),
      charStart,
      charEnd,
      pageHint: pageHintFor(charStart, chapters),
      tokenCount: Math.ceil((end - cursor) * 1.3),
    });
    chunkIndex++;

    if (end >= text.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

function pageHintFor(charStart: number, chapters: ChapterMarker[]): string | null {
  if (chapters.length === 0) return null;
  // Find last chapter whose offset <= charStart
  let result: string | null = null;
  for (const ch of chapters) {
    if (ch.offset <= charStart) result = ch.label;
    else break;
  }
  return result;
}
