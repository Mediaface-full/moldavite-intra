// Primary Aerodynamic Shape (PAS) catalogue for moldavites.
// Stable English slug is what gets written to the DB; the CZ/EN labels
// and descriptions are used in UI, exports and AI prompts.

export interface PasShape {
  key: string;          // stable ID stored in DB (SHOUTY_SNAKE)
  cz: string;           // Czech name shown in CZ UI + CZ description text
  en: string;           // English name shown in EN export + EN description
  descCz: string;       // Czech description (for prompt tag, export, certificate)
  descEn: string;       // English description
}

export const PAS_SHAPES: PasShape[] = [
  {
    key: 'DROP',
    cz: 'Kapka',
    en: 'Drop / Teardrop',
    descCz: 'Klasický protáhlý tvar s jedním kulatým a jedním špičatým koncem.',
    descEn: 'A classic elongated shape with one rounded and one pointed end.',
  },
  {
    key: 'ROD',
    cz: 'Tyčka',
    en: 'Rod / Bar',
    descCz: 'Podlouhlý, válcovitý tvar připomínající kolík.',
    descEn: 'An elongated, cylindrical shape resembling a small rod.',
  },
  {
    key: 'DUMBBELL',
    cz: 'Činka',
    en: 'Dumbbell',
    descCz: 'Tvar se dvěma rozšířenými konci spojenými užším krčkem.',
    descEn: 'A shape with two bulbous ends connected by a narrower neck.',
  },
  {
    key: 'MEDALLION',
    cz: 'Medailon',
    en: 'Medallion',
    descCz: 'Plochý, pravidelně zaoblený tvar (ovál či kruh), silnější než disk.',
    descEn: 'A flat, regularly rounded shape (oval or circle), thicker than a disc.',
  },
  {
    key: 'DISC',
    cz: 'Disk',
    en: 'Disc',
    descCz: 'Velmi plochý, symetrický a tenký kruhový útvar.',
    descEn: 'A very flat, symmetrical, and thin circular object.',
  },
  {
    key: 'HALF_DISC',
    cz: 'Půldisk',
    en: 'Half-disc',
    descCz: 'Tvar vzniklý rozlomením disku, obvykle s rovnou hranou lomu.',
    descEn: 'A shape formed by a disc breaking, usually with a straight fracture edge.',
  },
  {
    key: 'SPHERE',
    cz: 'Kulička',
    en: 'Sphere / Spheroid',
    descCz: 'Kulovitý až mírně zploštělý sférický tvar.',
    descEn: 'A spherical to slightly flattened (oblate) round shape.',
  },
  {
    key: 'PLATE',
    cz: 'Placka',
    en: 'Plate / Flattened',
    descCz: 'Podobná medailonu, ale obvykle nepravidelnější a velmi tenká.',
    descEn: 'Similar to a medallion, but usually more irregular and very thin.',
  },
  {
    key: 'SPOON',
    cz: 'Lžíce',
    en: 'Spoon',
    descCz: 'Vzniká deformací činky nebo kapky, kdy se jedna strana zploští.',
    descEn: 'Formed by the deformation of a dumbbell or drop, where one side flattens out.',
  },
  {
    key: 'TWIN',
    cz: 'Dvojče',
    en: 'Twin',
    descCz: 'Vzácný případ, kdy se dva tvary (např. kuličky) spojily za letu.',
    descEn: 'A rare case where two shapes (e.g., spheres) fused together during flight.',
  },
];

const BY_KEY: Record<string, PasShape> = Object.fromEntries(PAS_SHAPES.map((s) => [s.key, s]));
const BY_CZ: Record<string, PasShape> = Object.fromEntries(PAS_SHAPES.map((s) => [s.cz.toLowerCase(), s]));

/**
 * Lookup PAS metadata. Přijímá oba formáty:
 *  - SHOUTY_SNAKE key (legacy, např. „DROP") — historické záznamy v DB
 *  - CZ název (např. „Kapka") — nový formát ukládaný přes AttrSelect
 *
 * Vrátí null jen pro úplně neznámou hodnotu.
 */
export function getPasShape(key: string | null | undefined): PasShape | null {
  if (!key) return null;
  return BY_KEY[key] ?? BY_CZ[key.toLowerCase()] ?? null;
}

export function pasShapeCz(key: string | null | undefined): string {
  return getPasShape(key)?.cz ?? '';
}

export function pasShapeEn(key: string | null | undefined): string {
  return getPasShape(key)?.en ?? '';
}

export function pasShapeKeys(): string[] {
  return PAS_SHAPES.map((s) => s.key);
}
