/**
 * Výchozí prompt AI generování textů kamene — sdílený modalem (jednotlivě) a hromadným
 * generováním na kazetě (`lib/ai/bulkJobs.ts`). Značky {…} doplňuje `generateTextsForItem`.
 */
export const DEFAULT_PROMPT = `Jsi zkušený copywriter pro e-shopy s drahými kameny. Na základě těchto parametrů:
- Katalogové číslo: {katalogove_cislo}
- Hmotnost: {hmotnost}
- Místo nálezu: {misto_nalezu}
- Primární aerodynamický tvar: {tvar_cz} ({tvar_en}) — {tvar_popis_cz}

Vytvoř:
1. Krátký název produktu v češtině (max 60 znaků, ideálně zmiň tvar)
2. Krátký název produktu v angličtině (max 60 znaků, mention shape)
3. Poutavý marketingový popis v češtině (cca 3-4 věty, využij tvar)
4. Seznam 3 hlavních výhod v odrážkách v češtině
5. Překlad popisu do profesionální angličtiny (use {tvar_en})
6. Seznam 3 výhod v angličtině

Výstup formátuj POUZE jako JSON (bez dalšího textu) s klíči:
{
  "name_cz": "...",
  "name_en": "...",
  "desc_cz": "...",
  "bullets_cz": ["...", "...", "..."],
  "desc_en": "...",
  "bullets_en": ["...", "...", "..."]
}`;
