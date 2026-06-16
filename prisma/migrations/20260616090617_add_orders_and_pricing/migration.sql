-- CreateEnum
CREATE TYPE "AllocationMethod" AS ENUM ('BY_WEIGHT', 'BY_PURCHASE_PRICE', 'EQUAL_PER_PIECE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PRICED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PricingStatus" AS ENUM ('NEEDS_INPUT', 'NEEDS_REVIEW', 'OK', 'STALE');

-- AlterTable
ALTER TABLE "Box" ADD COLUMN     "orderId" INTEGER;

-- AlterTable
ALTER TABLE "ExportConfig" ADD COLUMN     "roundingStep" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "allocatedOrderCostCzk" DECIMAL(10,2),
ADD COLUMN     "attrCollectible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attrColor" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "attrDamage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "computedMarginRate" DECIMAL(6,4),
ADD COLUMN     "computedMinPriceExVatCzk" DECIMAL(10,2),
ADD COLUMN     "computedMinPriceInclVatCzk" DECIMAL(10,2),
ADD COLUMN     "finalInternalPriceInclVatCzk" DECIMAL(10,2),
ADD COLUMN     "lastCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "manualPriceInclVatCzk" DECIMAL(10,2),
ADD COLUMN     "orderId" INTEGER,
ADD COLUMN     "pricingStatus" "PricingStatus" NOT NULL DEFAULT 'NEEDS_INPUT',
ADD COLUMN     "purchasePricePerGramCzk" DECIMAL(10,2),
ADD COLUMN     "purchasePricePerGramSource" DECIMAL(10,2),
ADD COLUMN     "recommendedPriceInclVatCzk" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "sellerName" TEXT NOT NULL DEFAULT '',
    "sellerContact" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TIMESTAMP(3),
    "declaredPieces" INTEGER NOT NULL DEFAULT 0,
    "declaredWeight" DECIMAL(10,2),
    "originLocality" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sourceCurrency" TEXT NOT NULL DEFAULT 'CZK',
    "totalPurchaseAmountSource" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPurchaseAmountCzk" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "exchangeRate" DECIMAL(12,6),
    "exchangeRateDate" TIMESTAMP(3),
    "defaultPurchasePricePerGramSource" DECIMAL(10,2),
    "defaultPurchasePricePerGramCzk" DECIMAL(10,2),
    "allocationMethod" "AllocationMethod" NOT NULL DEFAULT 'BY_WEIGHT',
    "vatRatePct" DECIMAL(5,2) NOT NULL DEFAULT 21.00,
    "roundingStep" INTEGER NOT NULL DEFAULT 10,
    "pricingConfigId" INTEGER,
    "pricingConfigSnapshot" JSONB,
    "pricingConfigVersion" INTEGER,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCostItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "typeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allocationMethodOverride" "AllocationMethod",
    "amountSource" DECIMAL(10,2) NOT NULL,
    "amountCzk" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "exchangeRate" DECIMAL(12,6),
    "exchangeRateDate" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_purchaseDate_idx" ON "Order"("purchaseDate");

-- CreateIndex
CREATE INDEX "OrderCostItem_orderId_idx" ON "OrderCostItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderCostItem_typeKey_idx" ON "OrderCostItem"("typeKey");

-- CreateIndex
CREATE INDEX "PricingConfig_active_idx" ON "PricingConfig"("active");

-- CreateIndex
CREATE INDEX "Box_orderId_idx" ON "Box"("orderId");

-- CreateIndex
CREATE INDEX "Item_orderId_idx" ON "Item"("orderId");

-- CreateIndex
CREATE INDEX "Item_pricingStatus_idx" ON "Item"("pricingStatus");

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pricingConfigId_fkey" FOREIGN KEY ("pricingConfigId") REFERENCES "PricingConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCostItem" ADD CONSTRAINT "OrderCostItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
