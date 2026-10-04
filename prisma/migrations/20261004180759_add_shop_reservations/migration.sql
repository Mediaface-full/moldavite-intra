-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "shopOrderNumber" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ShopReservation" (
    "id" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopReservation_itemId_expiresAt_idx" ON "ShopReservation"("itemId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopReservation_itemId_ref_key" ON "ShopReservation"("itemId", "ref");

-- AddForeignKey
ALTER TABLE "ShopReservation" ADD CONSTRAINT "ShopReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
