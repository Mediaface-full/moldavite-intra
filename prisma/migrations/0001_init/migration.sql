-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Box" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "placement" TEXT NOT NULL DEFAULT '',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "evidNumber" TEXT NOT NULL,
    "boxId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "nameEn" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "longDescription" TEXT NOT NULL DEFAULT '',
    "longDescriptionEn" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT '',
    "purchasePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "priceEUR" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "priceUSD" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "weightCt" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "sold" BOOLEAN NOT NULL DEFAULT false,
    "onShop" BOOLEAN NOT NULL DEFAULT false,
    "onEtsy" BOOLEAN NOT NULL DEFAULT false,
    "upgatesId" TEXT NOT NULL DEFAULT '',
    "etsyId" TEXT NOT NULL DEFAULT '',
    "certHash" TEXT NOT NULL DEFAULT '',
    "mainPhoto" INTEGER NOT NULL DEFAULT 1,
    "photoPath" TEXT NOT NULL DEFAULT '',
    "rangeFolder" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" SERIAL NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'CNB',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportConfig" (
    "id" SERIAL NOT NULL,
    "exportType" TEXT NOT NULL,
    "currencies" TEXT[] DEFAULT ARRAY['CZK']::TEXT[],
    "primaryCurrency" TEXT NOT NULL DEFAULT 'CZK',
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "roundPrices" BOOLEAN NOT NULL DEFAULT true,
    "languages" TEXT[] DEFAULT ARRAY['cz']::TEXT[],
    "primaryLanguage" TEXT NOT NULL DEFAULT 'cz',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Box_code_key" ON "Box"("code");

-- CreateIndex
CREATE INDEX "Item_boxId_idx" ON "Item"("boxId");

-- CreateIndex
CREATE INDEX "Item_onShop_idx" ON "Item"("onShop");

-- CreateIndex
CREATE INDEX "Item_onEtsy_idx" ON "Item"("onEtsy");

-- CreateIndex
CREATE UNIQUE INDEX "Item_boxId_evidNumber_key" ON "Item"("boxId", "evidNumber");

-- CreateIndex
CREATE INDEX "ExchangeRate_currency_idx" ON "ExchangeRate"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "ExportConfig_exportType_key" ON "ExportConfig"("exportType");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

