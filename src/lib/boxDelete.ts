/**
 * Rozhodnutí, zda jde kazetu smazat — sdílené API (DELETE /api/boxes/[id])
 * a UI (BoxDeleteButton), aby tlačítko a server říkaly totéž.
 *
 * Pravidla (15. 9. 2026, Gideon: „nemohu odstranit kazetu, což je divné"):
 *  - prázdná kazeta → OK
 *  - kazeta s kameny bez `withItems` → 409 (klient musí explicitně chtít
 *    smazat i kameny; chrání před omylem)
 *  - kazeta s PRODANÝM kamenem → 409 vždy (prodané kameny nesou zafixovaný
 *    audit prodeje `priceCalcSnapshot` — ten se nemaže, kámen se má přesunout)
 */
export type BoxDeleteDecision =
  | { ok: true }
  | { ok: false; status: 409; error: string };

function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n < 5 ? few : many}`;
}

export function decideBoxDelete(input: { itemCount: number; soldCount: number; withItems: boolean }): BoxDeleteDecision {
  const { itemCount, soldCount, withItems } = input;
  if (itemCount <= 0) return { ok: true };
  if (soldCount > 0) {
    return {
      ok: false,
      status: 409,
      error: `Kazeta obsahuje ${plural(soldCount, 'prodaný kámen', 'prodané kameny', 'prodaných kamenů')} s auditem prodeje — ty smazat nelze. Přesuň je do jiné kazety a zkus to znovu.`,
    };
  }
  if (!withItems) {
    return {
      ok: false,
      status: 409,
      error: `Kazeta obsahuje ${plural(itemCount, 'kámen', 'kameny', 'kamenů')} — pošli ?withItems=1 pro smazání i s nimi.`,
    };
  }
  return { ok: true };
}
