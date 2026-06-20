/**
 * Ingest pipeline orchestrace.
 *
 * Steps:
 *   1. status: PENDING -> INDEXING
 *   2. extractText (txt nebo epub)
 *   3. chunkText (700/150)
 *   4. embedTexts (batch 100, Gemini RETRIEVAL_DOCUMENT)
 *   5. INSERT VsevedChunk rows s embedding (raw SQL kvuli pgvector)
 *   6. status: INDEXING -> READY, set chunkCount + indexedAt
 *
 * Volat z upload route jako fire-and-forget Promise:
 *   void processDocument(id).catch((err) => console.error(...));
 *
 * Erro flow: status -> FAILED, statusError = err.message
 */
import { prisma } from '@/lib/prisma';
import { extractText } from './extractText';
import { chunkText } from './chunkText';
import { embedTexts } from './embed';
import { getDocumentPath } from './storage';
import type { Chunk } from './types';

export async function processDocument(documentId: number): Promise<void> {
  // Mark INDEXING
  await prisma.vsevedDocument.update({
    where: { id: documentId },
    data: { status: 'INDEXING', statusError: null },
  });

  try {
    const doc = await prisma.vsevedDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.format !== 'txt' && doc.format !== 'epub') {
      throw new Error(`Unsupported format: ${doc.format}`);
    }

    const filePath = getDocumentPath(documentId, doc.format);
    const extracted = await extractText(filePath, doc.format);

    const chunks: Chunk[] = chunkText(extracted.text, extracted.chapters);
    if (chunks.length === 0) throw new Error('No chunks generated (empty text?)');

    // Embed in batches (embedTexts handles 100-per-batch internally)
    const embeddings = await embedTexts(chunks.map((c) => c.text));
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`);
    }

    // Insert chunks s embedding (raw SQL kvuli pgvector Unsupported type)
    // Prisma neumi vlozit vector — pouzivame $executeRaw s Prisma.sql.
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const embeddingLiteral = vectorLiteral(embeddings[i]);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "VsevedChunk"
          ("documentId", "chunkIndex", "text", "charStart", "charEnd", "pageHint", "tokenCount", "embedding")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
        documentId,
        c.chunkIndex,
        c.text,
        c.charStart,
        c.charEnd,
        c.pageHint,
        c.tokenCount,
        embeddingLiteral,
      );
    }

    await prisma.vsevedDocument.update({
      where: { id: documentId },
      data: {
        status: 'READY',
        chunkCount: chunks.length,
        textLength: extracted.text.length,
        indexedAt: new Date(),
        statusError: null,
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Lidsky srozumitelna hlaska pro nejcastejsi pripady — pro UI badge.
    let friendly = raw;
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      friendly = 'Gemini API limit překročen. Počkej minutu nebo upgraduj billing tier. Detail: ' + raw.slice(0, 500);
    } else if (raw.includes('GEMINI_API_KEY')) {
      friendly = 'GEMINI_API_KEY není nastaven v env. Doplň ho a restartuj kontejner.';
    } else if (raw.includes('404') || raw.includes('NOT_FOUND')) {
      friendly = 'Gemini model nenalezen — pravděpodobně deprecated. Zkontroluj embed.ts EMBEDDING_MODEL.';
    }
    await prisma.vsevedDocument.update({
      where: { id: documentId },
      data: { status: 'FAILED', statusError: friendly.slice(0, 1000) },
    });
    throw err;
  }
}

/**
 * Convert number[] → pgvector string literal '[1.0,2.0,...]'
 * Pgvector accepts text input format '[v1,v2,...]'
 */
function vectorLiteral(embedding: number[]): string {
  return '[' + embedding.map((v) => v.toString()).join(',') + ']';
}
