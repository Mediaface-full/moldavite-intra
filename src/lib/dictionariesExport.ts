/**
 * Export číselníků kamenů (Markdown / JSON) — generuje se ze živých dat
 * (`AttrOption` + použití na kamenech/kazetách), takže nikdy nezastará.
 *
 * Gideon 4. 10. 2026: místo statického MD dokumentu „export do appky".
 * Tlačítko je v /admin/attributes, endpoint GET /api/admin/dictionaries-export.
 *
 * Pure funkce — žádná DB. Route si načte číselník + počty a předá je sem.
 */
import { PAS_SHAPES, getPasShape } from './pasShapes';
import { weightRange } from './exportParams';

export type DictOption = {
  attrKey: string;
  value: string;
  label: string | null;
  labelEn: string | null;
  sortOrder: number;
  active: boolean;
};

/** attrKey → hodnota → počet záznamů (kamenů; u cassetteType kazet), které ji drží. */
export type DictUsage = Record<string, Record<string, number>>;

export interface DictExportInput {
  options: DictOption[];
  usage: DictUsage;
  generatedAt: Date;
}

const KNOWN_SECTIONS: Array<{ key: string; title: string; unit: string; note?: string }> = [
  { key: 'pasShape', title: 'Tvar (PAS)', unit: 'kamenů', note: 'Primary Aerodynamic Shape. Do DB se ukládá český název; starší záznamy mají klíč (např. `DROP`), oba formáty se zobrazí správně. Popisy se používají v AI promptech, na certifikátu a v exportech.' },
  { key: 'location', title: 'Místo nálezu', unit: 'kamenů', note: 'V e-shop feedu jako parametr **Lokalita** / **Location** (EN = `labelEn`, jinak CZ hodnota).' },
  { key: 'attrColor', title: 'Barva', unit: 'kamenů', note: 'Kámen může mít **víc barev najednou**. V e-shop feedu každá barva jako samostatný parametr **Barva** / **Color**.' },
  { key: 'attrDamage', title: 'Poškození / stav', unit: 'kamenů', note: 'Vstupuje do cenotvorby (maržová pravidla) a do e-shop feedu jako **Stav** / **Condition**.' },
  { key: 'cassetteType', title: 'Typ kazety', unit: 'kazet', note: 'Kategorie kazety podle obsahu. Vlastní typy jde přidat v /admin/attributes.' },
];

function fmtDate(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function fmtDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function sortOptions(opts: DictOption[]): DictOption[] {
  return [...opts].sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value, 'cs'));
}

/**
 * Použití hodnoty: u pasShape sečte legacy klíč (`DROP`) a CZ název (`Kapka`),
 * protože oba znamenají tentýž tvar.
 */
function usageFor(usage: DictUsage, attrKey: string, value: string): number {
  const map = usage[attrKey] ?? {};
  if (attrKey !== 'pasShape') return map[value] ?? 0;
  const shape = getPasShape(value);
  if (!shape) return map[value] ?? 0;
  let n = 0;
  for (const [k, c] of Object.entries(map)) {
    if (getPasShape(k)?.key === shape.key) n += c;
  }
  return n;
}

/** Hodnoty použité na kamenech/kazetách, které v číselníku nejsou (osiřelé). */
function orphans(usage: DictUsage, attrKey: string, opts: DictOption[]): Array<{ value: string; count: number }> {
  const map = usage[attrKey] ?? {};
  const known = new Set(opts.map((o) => o.value));
  const out: Array<{ value: string; count: number }> = [];
  for (const [value, count] of Object.entries(map)) {
    if (!value) continue;
    if (known.has(value)) continue;
    if (attrKey === 'pasShape') {
      const shape = getPasShape(value);
      if (shape && opts.some((o) => getPasShape(o.value)?.key === shape.key)) continue; // legacy klíč známého tvaru
    }
    out.push({ value, count });
  }
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'cs'));
}

export function buildDictionariesMarkdown(input: DictExportInput): string {
  const { options, usage, generatedAt } = input;
  const byKey: Record<string, DictOption[]> = {};
  for (const o of options) (byKey[o.attrKey] ??= []).push(o);

  const L: string[] = [];
  L.push('# Číselníky kamenů — Moldavite Intra');
  L.push('');
  L.push(`**Vygenerováno:** ${fmtDate(generatedAt)} · ze živé databáze (\`/admin/attributes\`) · bez cen (cenotvorba viz \`CENOTVORBA.md\`)`);
  L.push('');
  L.push('Sloupec **Kamenů** = kolik kamenů (u typu kazety: kazet) hodnotu právě drží. Neaktivní hodnota se nenabízí v nových výběrech, existující záznamy si ji nechají.');
  L.push('');

  let n = 0;
  for (const sec of KNOWN_SECTIONS) {
    const opts = sortOptions(byKey[sec.key] ?? []);
    n++;
    L.push(`## ${n}. ${sec.title} (\`${sec.key}\`) — ${opts.length} hodnot, ${opts.filter((o) => o.active).length} aktivních`);
    L.push('');
    if (sec.note) { L.push(sec.note); L.push(''); }

    if (opts.length === 0) {
      L.push('_Číselník je prázdný._');
      L.push('');
    } else if (sec.key === 'pasShape') {
      L.push('| CZ | EN | Klíč | Popis CZ | Popis EN | Aktivní | Kamenů |');
      L.push('|---|---|---|---|---|---|---|');
      for (const o of opts) {
        const s = getPasShape(o.value);
        L.push(`| ${esc(o.label || o.value)} | ${esc(o.labelEn || s?.en || '')} | ${s ? `\`${s.key}\`` : '—'} | ${esc(s?.descCz || '')} | ${esc(s?.descEn || '')} | ${o.active ? 'ano' : 'ne'} | ${usageFor(usage, sec.key, o.value)} |`);
      }
      L.push('');
      const missing = PAS_SHAPES.filter((s) => !opts.some((o) => getPasShape(o.value)?.key === s.key));
      if (missing.length) {
        L.push(`Tvary z \`lib/pasShapes.ts\`, které v číselníku chybí (nejdou vybrat v UI): ${missing.map((s) => `**${s.cz}** (${s.en})`).join(', ')}.`);
        L.push('');
      }
    } else {
      L.push(`| Hodnota | EN (\`labelEn\`) | Aktivní | ${sec.unit[0].toUpperCase() + sec.unit.slice(1)} |`);
      L.push('|---|---|---|---|');
      for (const o of opts) {
        L.push(`| ${esc(o.label || o.value)} | ${esc(o.labelEn || '')} | ${o.active ? 'ano' : 'ne'} | ${usageFor(usage, sec.key, o.value)} |`);
      }
      L.push('');
      if (opts.some((o) => !o.labelEn)) {
        L.push('_Prázdné `labelEn` → EN export dostane českou hodnotu. Doplň v /admin/attributes._');
        L.push('');
      }
    }

    const orph = orphans(usage, sec.key, opts);
    if (orph.length) {
      L.push(`**Hodnoty mimo číselník** (záznamy je drží, ale v \`/admin/attributes\` nejsou — zobrazí se jako „mimo aktivní seznam"): ${orph.map((x) => `${esc(x.value)} (${x.count})`).join(', ')}.`);
      L.push('');
    }
  }

  // Vlastní attrKey, které neznáme (kdyby někdy přibyly)
  const extraKeys = Object.keys(byKey).filter((k) => !KNOWN_SECTIONS.some((s) => s.key === k)).sort();
  for (const key of extraKeys) {
    const opts = sortOptions(byKey[key]);
    n++;
    L.push(`## ${n}. \`${key}\` — ${opts.length} hodnot`);
    L.push('');
    L.push('| Hodnota | EN (`labelEn`) | Aktivní |');
    L.push('|---|---|---|');
    for (const o of opts) L.push(`| ${esc(o.label || o.value)} | ${esc(o.labelEn || '')} | ${o.active ? 'ano' : 'ne'} |`);
    L.push('');
  }

  // Odvozené / pevné
  n++;
  L.push(`## ${n}. Sbírkový kus (\`attrCollectible\`)`);
  L.push('');
  L.push('Ano / Ne (zaškrtávátko na kameni). Vstupuje do cenotvorby a do e-shop feedu jako **Sbírkový kus** / **Collector\'s piece** — posílá se vždy, i „Ne".');
  L.push('');

  n++;
  L.push(`## ${n}. Velikost — odvozená z hmotnosti (není číselník)`);
  L.push('');
  L.push('| Hmotnost | CZ | EN |');
  L.push('|---|---|---|');
  L.push('| 0,1 – 3,0 g | Malé | Small |');
  L.push('| 3,1 – 9,9 g | Střední | Medium |');
  L.push('| ≥ 10 g | Velké | Large |');
  L.push('');
  L.push('Počítá se automaticky (`lib/sizeCategory.ts`), nedá se ručně přepsat. Kámen bez hmotnosti velikost nemá.');
  L.push('');

  n++;
  L.push(`## ${n}. Hmotnostní kategorie — odvozená, pro e-shop filtr`);
  L.push('');
  L.push('| Hmotnost | CZ | EN |');
  L.push('|---|---|---|');
  for (const w of [1, 4, 7, 15, 25]) {
    const r = weightRange(w)!;
    const bound = w === 1 ? '≤ 3 g' : w === 4 ? '3 – 5 g' : w === 7 ? '5 – 10 g' : w === 15 ? '10 – 20 g' : '≥ 20 g';
    L.push(`| ${bound} | ${r.cz} | ${r.en} |`);
  }
  L.push('');

  n++;
  L.push(`## ${n}. Hmotnost`);
  L.push('');
  L.push('- Gramy na **2 desetinná místa** (globální konvence).');
  L.push('- Karáty (`weightCt`) = g × 5, dopočítávají se automaticky při změně hmotnosti.');
  L.push('');

  n++;
  L.push(`## ${n}. Co není číselník (volný text)`);
  L.push('');
  L.push('Název CZ/EN, popis CZ/EN, dlouhý popis CZ/EN (HTML), umístění kazety (`placement`) a kamene (`storage`), text k roztřídění z hlasového vstupu (`voiceNotes`), ID pro Upgates/Etsy.');
  L.push('');

  n++;
  L.push(`## ${n}. Správa — \`/admin/attributes\``);
  L.push('');
  L.push('- **Přidat** → hned v dropdownech i v hlasovém vstupu (AI dostává aktuální seznam).');
  L.push('- **Přejmenovat** → propíše se na všechny kameny/kazety, které hodnotu drží.');
  L.push('- **Deaktivovat** → zmizí z nových výběrů, existující záznamy si hodnotu nechají.');
  L.push('- **Smazat** → blokováno, pokud hodnotu někdo drží („Smazat i přesto" nechá záznamům osiřelou hodnotu). Raději deaktivovat.');
  L.push('- **`labelEn`** → anglický překlad pro e-shop/Etsy export.');
  L.push('- Výchozí seed se použije jen pro prázdný číselník — tvoje úpravy po deployi nepřepíše.');
  L.push('');

  return L.join('\n');
}

export function buildDictionariesJson(input: DictExportInput) {
  const { options, usage, generatedAt } = input;
  const byKey: Record<string, unknown[]> = {};
  for (const o of sortOptions(options)) {
    const s = o.attrKey === 'pasShape' ? getPasShape(o.value) : null;
    (byKey[o.attrKey] ??= []).push({
      value: o.value,
      label: o.label,
      labelEn: o.labelEn ?? (s?.en ?? null),
      active: o.active,
      sortOrder: o.sortOrder,
      usage: usageFor(usage, o.attrKey, o.value),
      ...(s ? { key: s.key, descCz: s.descCz, descEn: s.descEn } : {}),
    });
  }
  const orphanMap: Record<string, Array<{ value: string; count: number }>> = {};
  for (const key of Object.keys(usage)) {
    const o = orphans(usage, key, options.filter((x) => x.attrKey === key));
    if (o.length) orphanMap[key] = o;
  }
  return {
    generatedAt: generatedAt.toISOString(),
    dictionaries: byKey,
    orphans: orphanMap,
    derived: {
      sizeCategory: [
        { from: 0.1, to: 3.0, cz: 'Malé', en: 'Small' },
        { from: 3.1, to: 9.9, cz: 'Střední', en: 'Medium' },
        { from: 10, to: null, cz: 'Velké', en: 'Large' },
      ],
      weightRange: [1, 4, 7, 15, 25].map((w) => weightRange(w)),
      weightCt: 'g × 5',
    },
  };
}

export function dictionariesExportFilename(generatedAt: Date, format: 'md' | 'json'): string {
  return `ciselniky-kamene-${fmtDateIso(generatedAt)}.${format}`;
}
