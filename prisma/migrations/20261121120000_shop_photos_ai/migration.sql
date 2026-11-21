-- Výběr fotek pro e-shop (max 4) + AI úpravy fotek (21. 11. 2026)
ALTER TABLE "Item" ADD COLUMN "shopPhotos" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Item" ADD COLUMN "aiPhotos" JSONB;
