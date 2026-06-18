-- ─── 1. Seller (nová entita) ─────────────────────────────────────────
CREATE TABLE "Seller" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "alias" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Seller_active_idx" ON "Seller"("active");
CREATE INDEX "Seller_lastName_idx" ON "Seller"("lastName");


-- ─── 2. Order: + sellerId FK (sellerName zůstává jako legacy) ────────
ALTER TABLE "Order" ADD COLUMN "sellerId" INTEGER;
CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── 3. Box rozšíření (sellerId + per-kazeta cenotvorba) ─────────────
ALTER TABLE "Box" ADD COLUMN "sellerId" INTEGER;
ALTER TABLE "Box" ADD COLUMN "declaredPieces" INTEGER;
ALTER TABLE "Box" ADD COLUMN "declaredWeight" DECIMAL(10,2);
ALTER TABLE "Box" ADD COLUMN "purchaseAmountCzk" DECIMAL(12,2);
ALTER TABLE "Box" ADD COLUMN "purchasePricePerGramCzk" DECIMAL(10,2);

CREATE INDEX "Box_sellerId_idx" ON "Box"("sellerId");
ALTER TABLE "Box" ADD CONSTRAINT "Box_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── 4. CassetteType enum → String (zachování dat) ───────────────────
-- Dropneme starý index aby šel sloupec přejmenovat
DROP INDEX IF EXISTS "Box_cassetteType_idx";

-- Přidáme nový VARCHAR sloupec s mapovanou hodnotou ze stávajícího enum
ALTER TABLE "Box" ADD COLUMN "cassetteType_new" TEXT NOT NULL DEFAULT 'Kameny';

UPDATE "Box" SET "cassetteType_new" = CASE
  WHEN "cassetteType"::text = 'STONES'     THEN 'Kameny'
  WHEN "cassetteType"::text = 'PROCESSED'  THEN 'Opracované kusy'
  WHEN "cassetteType"::text = 'TO_PROCESS' THEN 'K opracování'
  WHEN "cassetteType"::text = 'DUST'       THEN 'Prach'
  ELSE 'Kameny'
END;

-- Smazat starý sloupec a enum typ, přejmenovat nový
ALTER TABLE "Box" DROP COLUMN "cassetteType";
ALTER TABLE "Box" RENAME COLUMN "cassetteType_new" TO "cassetteType";
DROP TYPE IF EXISTS "CassetteType";

-- Index na novém sloupci
CREATE INDEX "Box_cassetteType_idx" ON "Box"("cassetteType");


-- ─── 5. Item rozšíření: costBasisCzk (cena s náklady) ────────────────
ALTER TABLE "Item" ADD COLUMN "costBasisCzk" DECIMAL(10,2);
