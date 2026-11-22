-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "etsyReceiptId" BIGINT,
ADD COLUMN     "soldChannel" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "EtsyConnection" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shopId" BIGINT NOT NULL,
    "shopName" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "etsyUserId" BIGINT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedReason" TEXT,

    CONSTRAINT "EtsyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtsySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "taxonomyId" INTEGER,
    "shippingProfileId" BIGINT,
    "readinessStateId" BIGINT,
    "returnPolicyId" BIGINT,
    "whoMade" TEXT NOT NULL DEFAULT 'someone_else',
    "whenMade" TEXT NOT NULL DEFAULT 'before_2007',
    "isSupply" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtsySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtsyListing" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "listingId" BIGINT,
    "state" TEXT NOT NULL DEFAULT 'none',
    "blockedReason" TEXT,
    "syncedHash" TEXT NOT NULL DEFAULT '',
    "imageIds" BIGINT[] DEFAULT ARRAY[]::BIGINT[],
    "priceSent" DECIMAL(10,2),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "inactiveSince" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),

    CONSTRAINT "EtsyListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtsyJob" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "EtsyJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtsyOrder" (
    "id" SERIAL NOT NULL,
    "receiptId" BIGINT NOT NULL,
    "listingIds" BIGINT[] DEFAULT ARRAY[]::BIGINT[],
    "itemIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "paidAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EtsyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtsyWebhookEvent" (
    "webhookId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtsyWebhookEvent_pkey" PRIMARY KEY ("webhookId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EtsyListing_itemId_key" ON "EtsyListing"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "EtsyListing_listingId_key" ON "EtsyListing"("listingId");

-- CreateIndex
CREATE INDEX "EtsyJob_doneAt_runAfter_idx" ON "EtsyJob"("doneAt", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "EtsyOrder_receiptId_key" ON "EtsyOrder"("receiptId");

-- AddForeignKey
ALTER TABLE "EtsyListing" ADD CONSTRAINT "EtsyListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Otevřený job je na kámen a druh max jeden (lib/etsy/queue.ts upsert ON CONFLICT). Prisma ho ve schématu neumí.
CREATE UNIQUE INDEX "EtsyJob_open_unique" ON "EtsyJob"("itemId", "kind") WHERE "doneAt" IS NULL;
