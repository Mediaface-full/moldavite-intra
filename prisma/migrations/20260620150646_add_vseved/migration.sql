-- Pre-requisite: pgvector extension (Task 1 swapnul image na pgvector/pgvector:pg16)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "VsevedDocument" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'cs',
    "sourceFile" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "textLength" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusError" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indexedAt" TIMESTAMP(3),

    CONSTRAINT "VsevedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VsevedChunk" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "pageHint" TEXT,
    "tokenCount" INTEGER NOT NULL,
    "embedding" vector(768),

    CONSTRAINT "VsevedChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VsevedConversation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VsevedConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VsevedMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citedChunkIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "promptTokens" INTEGER,
    "responseTokens" INTEGER,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VsevedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VsevedDocument_status_idx" ON "VsevedDocument"("status");

-- CreateIndex
CREATE INDEX "VsevedDocument_language_idx" ON "VsevedDocument"("language");

-- CreateIndex
CREATE INDEX "VsevedChunk_documentId_idx" ON "VsevedChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "VsevedChunk_documentId_chunkIndex_key" ON "VsevedChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "VsevedConversation_userId_archived_idx" ON "VsevedConversation"("userId", "archived");

-- CreateIndex
CREATE INDEX "VsevedMessage_conversationId_createdAt_idx" ON "VsevedMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VsevedChunk" ADD CONSTRAINT "VsevedChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "VsevedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VsevedMessage" ADD CONSTRAINT "VsevedMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "VsevedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index pro fast cosine similarity search
-- (m=16, ef_construction=64 jsou pgvector defaults — vhodné pro <1M vectors)
CREATE INDEX "VsevedChunk_embedding_hnsw_idx" ON "VsevedChunk"
  USING hnsw (embedding vector_cosine_ops);
