#!/usr/bin/env node
/**
 * Seed defaultních hodnot atributů (tvar, poškození, lokalita, barva).
 *
 * Idempotentní: upsert podle (attrKey, value). Pokud uživatel hodnotu
 * v UI deaktivuje nebo přejmenuje, opětovné spuštění seedu ji NEvrátí
 * (upsert na unique klíč ji jen aktualizuje pokud má jiný label/sortOrder).
 *
 * Spuštění:
 *   node scripts/seed-attr-options.mjs
 *
 * Na NASu:
 *   docker exec moldavite_app node scripts/seed-attr-options.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Pořadí v polích = sortOrder. První je defaultní volba v dropdownu.
const SEED = {
  cassetteType: [
    'Kameny', 'Opracované kusy', 'K opracování', 'Prach',
  ],
  // Sjednoceno s lib/pasShapes.ts (PAS_SHAPES.cz) — full set 10 tvarů
  // (Kapka, Tyčka, Činka, Medailon, Disk, Půldisk, Kulička, Placka, Lžíce, Dvojče).
  // V UI dropdownech se zobrazuje tato Czech label, do DB se ukládá stejný text.
  // Soubor pasShapes.ts zůstává jako metadata zdroj (key/EN/popisy CZ+EN)
  // pro AI prompts, certifikáty a exporty — lookup přes pasShapeBy(value).
  pasShape: [
    'Kapka', 'Tyčka', 'Činka', 'Medailon', 'Disk', 'Půldisk',
    'Kulička', 'Placka', 'Lžíce', 'Dvojče',
  ],
  attrDamage: [
    'Bez poškození', 'Mikro odlesk', 'Odlesk', 'Setření z vrstvy', 'Opravovaný',
  ],
  location: [
    'Ježkovna, Besednice',
    'Chlum nad Malší',
    'Ločenice',
    'Nesměň',
    'Slavče u Trhových Svinů',
    'Vrábče',
    'Malý Chlum',
    'Dobrkobská Lhotka',
    'Marouškovo Pole',
    'Jiné',
  ],
  attrColor: [
    'zelená', 'radioaktivní zelená', 'namodralá', 'nahnědlá', 'Dvoubarevný', 'Neon', 'Jiná',
  ],
};

async function main() {
  console.log('==> Seed AttrOption');
  let created = 0;
  let updated = 0;

  for (const [attrKey, values] of Object.entries(SEED)) {
    console.log(`\n  ${attrKey}:`);
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const existing = await prisma.attrOption.findUnique({
        where: { attrKey_value: { attrKey, value } },
      });
      if (existing) {
        // Aktualizuj sortOrder pokud se posunul (zachovej active stav, label může uživatel mít vlastní)
        if (existing.sortOrder !== i * 10) {
          await prisma.attrOption.update({
            where: { id: existing.id },
            data: { sortOrder: i * 10 },
          });
          updated++;
          console.log(`    ~ ${value} (sortOrder ${existing.sortOrder} → ${i * 10})`);
        } else {
          console.log(`    = ${value} (beze změny)`);
        }
      } else {
        await prisma.attrOption.create({
          data: { attrKey, value, sortOrder: i * 10, active: true },
        });
        created++;
        console.log(`    + ${value}`);
      }
    }
  }

  console.log(`\n✓ Hotovo: ${created} vytvořeno, ${updated} aktualizováno`);
}

main()
  .catch((err) => { console.error('✗ Seed selhal:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
