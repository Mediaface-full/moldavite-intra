-- CreateEnum
CREATE TYPE "CassetteType" AS ENUM ('STONES', 'PROCESSED', 'TO_PROCESS', 'DUST');

-- AlterTable
ALTER TABLE "Box" ADD COLUMN     "cassetteType" "CassetteType" NOT NULL DEFAULT 'STONES';

-- CreateTable
CREATE TABLE "AttrOption" (
    "id" SERIAL NOT NULL,
    "attrKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttrOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttrOption_attrKey_active_sortOrder_idx" ON "AttrOption"("attrKey", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AttrOption_attrKey_value_key" ON "AttrOption"("attrKey", "value");

-- CreateIndex
CREATE INDEX "Box_cassetteType_idx" ON "Box"("cassetteType");
