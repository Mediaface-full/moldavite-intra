-- Migrace: ujednotit legacy hodnotu location "BESEDNICKÁ JEŽKOVNA"
-- (z importu starých dat) na kanonickou hodnotu "Ježkovna, Besednice"
-- která je v ciselniku AttrOption(attrKey='location').
--
-- Bez toho UI dropdown ukazuje "(mimo aktivní seznam)" u všech těchto kamenů
-- a Gideon je musel jeden po druhém přepínat ručně.

UPDATE "Item"
   SET "location" = 'Ježkovna, Besednice'
 WHERE "location" = 'BESEDNICKÁ JEŽKOVNA';
