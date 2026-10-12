-- Firma Bohemian Moldavite není plátce DPH (Gideon, 12. 10. 2026). Sazba 21 % se do
-- cenotvorby dostala jako default v Etapě 1 (16. 6. 2026) bez záměru.
-- 1) nové zakázky vznikají s 0 %
ALTER TABLE "Order" ALTER COLUMN "vatRatePct" SET DEFAULT 0.00;
-- 2) aktivní zakázky na 0 % (historické CANCELLED/ARCHIVED nechat — zafixovaný audit)
UPDATE "Order" SET "vatRatePct" = 0.00 WHERE "status" NOT IN ('CANCELLED', 'ARCHIVED');
-- Ceny kamenů se přepočítají tlačítkem „Přepočítat všechny zakázky" v Admin → Cenotvorba
-- (POST /api/admin/orders/recalc-all) — SQL migrace výpočtový modul volat nemůže.
