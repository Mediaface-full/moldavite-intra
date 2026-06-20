/**
 * Shared TypeScript types pro Vševěd modul.
 */

export type ChapterMarker = {
  /** Char offset v extracted text where this chapter starts. */
  offset: number;
  /** Human-readable chapter label, e.g. "Kapitola 3: Geneze". */
  label: string;
};

export type ExtractResult = {
  /** Cleaned text content of the document. */
  text: string;
  /** Chapter markers extracted from TOC (epub) or empty (plain txt). */
  chapters: ChapterMarker[];
};

export type Chunk = {
  chunkIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  pageHint: string | null;
  tokenCount: number;
};

export type RetrievedChunk = {
  id: number;
  documentId: number;
  documentTitle: string;
  documentAuthor: string;
  documentYear: number | null;
  chunkIndex: number;
  text: string;
  pageHint: string | null;
  similarity: number;
};
