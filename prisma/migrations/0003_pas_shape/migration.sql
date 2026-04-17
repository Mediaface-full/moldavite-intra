-- AlterTable
ALTER TABLE "Item" ADD COLUMN "pasShape" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Item_pasShape_idx" ON "Item"("pasShape");
