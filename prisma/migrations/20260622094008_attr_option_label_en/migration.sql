-- DropIndex
DROP INDEX "VsevedChunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "AttrOption" ADD COLUMN     "labelEn" TEXT;
