#!/usr/bin/env node
/**
 * Seed defaultních hodnot atributů (tvar, poškození, lokalita, barva).
 *
 * FIRST-TIME ONLY seed (od 22. 6. 2026): pokud již nějaký záznam pro daný
 * attrKey existuje v DB, seed pro tento attrKey PŘESKOČÍ. User je vlastníkem
 * seznamu od první chvíle co něco upraví v `/admin/attributes`.
 *
 * Důvod změny: starý seed byl „idempotentní jen pro update" — pokud user smazal
 * hodnotu, další start kontejneru ji vrátil zpět (entrypoint.sh spouští tento
 * script při každém startu). Vedlo to k frustration: smažeš „Lžíci", po deploy
 * je zpět.
 *
 * Důsledek: PŘIDÁNÍ nového defaultu (např. nová `pasShape`) přes update SEED
 * dictu zde nepomůže — user už má nějaké záznamy → skip. Pro propsání nové
 * defaultní hodnoty buď ji přidat ručně v `/admin/attributes`, nebo udělat
 * migraci SQL.
 *
 * Spuštění:
 *   node scripts/seed-attr-options.mjs
 *
 * Na NASu (manuálně, pokud potřeba re-seed po wipe):
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
  console.log('==> Seed AttrOption (first-time-only per attrKey)');
  let created = 0;
  let skipped = 0;

  for (const [attrKey, values] of Object.entries(SEED)) {
    // First-time-only check: pokud existuje JAKÝKOLIV záznam pro attrKey,
    // user už spravuje seznam — neměň ho. To zabrání tomu aby smazané
    // hodnoty „chodily zpět" po každém deploy.
    const existingCount = await prisma.attrOption.count({ where: { attrKey } });
    if (existingCount > 0) {
      console.log(`\n  ${attrKey}: ${existingCount} záznamů již existuje → SKIP (user owns)`);
      skipped++;
      continue;
    }

    console.log(`\n  ${attrKey}: prázdné → vytvářím initial seed`);
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      await prisma.attrOption.create({
        data: { attrKey, value, sortOrder: i * 10, active: true },
      });
      created++;
      console.log(`    + ${value}`);
    }
  }

  console.log(`\n✓ Hotovo: ${created} vytvořeno, ${skipped} attrKey skipped (user-managed)`);
}

main()
  .catch((err) => { console.error('✗ Seed selhal:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
