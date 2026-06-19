-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "priceCalcSnapshot" JSONB,
ADD COLUMN     "priceCalcSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "soldAt" TIMESTAMP(3);
