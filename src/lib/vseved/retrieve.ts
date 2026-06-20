/**
 * pgvector cosine similarity search.
 *
 * 1. Embed query (RETRIEVAL_QUERY task type)
 * 2. SELECT top-K chunks ORDER BY embedding <=> queryVec
 * 3. JOIN VsevedDocument pro citation metadata
 *
 * cosine distance operator <=> vraci 0 (identicke) az 2 (opacne).
 * similarity = 1 - distance, range -1 az 1 (1 = perfect match).
 */
import { prisma } from '@/lib/prisma';
import { embedQuery } from './embed';
import type { RetrievedChunk } from './types';

const DEFAULT_TOP_K = 8;

type RawRow = {
  id: number;
  documentid: number;
  documenttitle: string;
  documentauthor: string;
  documentyear: number | null;
  chunkindex: number;
  text: string;
  pagehint: string | null;
  distance: number;
};

export async function retrieveChunks(query: string, topK = DEFAULT_TOP_K): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];
  if (!Number.isInteger(topK) || topK <= 0 || topK > 50) topK = DEFAULT_TOP_K;

  const queryVec = await embedQuery(query);
  const vecLiteral = '[' + queryVec.map((v) => v.toString()).join(',') + ']';

  // SELECT s explicitnimi parametry — bezpecna parametrizace
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT
       c."id"             AS id,
       c."documentId"     AS documentid,
       d."title"          AS documenttitle,
       d."author"         AS documentauthor,
       d."year"           AS documentyear,
       c."chunkIndex"     AS chunkindex,
       c."text"           AS text,
       c."pageHint"       AS pagehint,
       (c."embedding" <=> $1::vector) AS distance
     FROM "VsevedChunk" c
     JOIN "VsevedDocument" d ON d."id" = c."documentId"
     WHERE d."status" = 'READY'
     ORDER BY c."embedding" <=> $1::vector
     LIMIT $2`,
    vecLiteral,
    topK,
  );

  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentid,
    documentTitle: r.documenttitle,
    documentAuthor: r.documentauthor,
    documentYear: r.documentyear,
    chunkIndex: r.chunkindex,
    text: r.text,
    pageHint: r.pagehint,
    similarity: 1 - Number(r.distance),
  }));
}
