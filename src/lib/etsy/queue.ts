/**
 * Fronta změn pro Etsy (tabulka EtsyJob). Bezpečnostně kritické události (rezervace, prodej) volají
 * enqueueEtsyJob UVNITŘ své transakce a po commitu kickEtsy — volání Etsy nikdy neblokuje rezervaci.
 * Otevřený job je na kámen a druh max jeden (částečný unikátní index EtsyJob_open_unique).
 */
import { etsyConfigured } from './config';

export type EtsyJobKind = 'sync' | 'activate' | 'deactivate' | 'remove';

type RawDb = { $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => unknown };

/**
 * Zařadí job. Existuje-li už otevřený job stejného druhu: pokusy se NEnulují (jinak by kontrola rozdílů
 * každých 5 min rušila čekání mezi pokusy a posílala upozornění znovu — review I1); urgentní událost
 * (rezervace, prodej, ruční změna) jen posune čekající job na teď. Běžící job (leasedUntil) to neovlivní.
 */
export async function enqueueEtsyJob(db: RawDb, itemId: number, kind: EtsyJobKind, reason: string, opts: { urgent?: boolean } = {}): Promise<void> {
  if (!etsyConfigured()) return;
  const urgent = opts.urgent ?? true;
  await db.$executeRaw`INSERT INTO "EtsyJob" ("itemId", "kind", "reason", "runAfter") VALUES (${itemId}, ${kind}, ${reason}, now()) ON CONFLICT ("itemId", "kind") WHERE "doneAt" IS NULL DO UPDATE SET "reason" = EXCLUDED."reason", "runAfter" = CASE WHEN ${urgent} THEN LEAST("EtsyJob"."runAfter", now()) ELSE "EtsyJob"."runAfter" END`;
}

/** Hned zpracovat joby daných kamenů (na pozadí). Chyba se jen zaloguje — plánovač to zkusí znovu. */
export function kickEtsy(itemIds: number[]): void {
  if (!etsyConfigured() || itemIds.length === 0) return;
  void import('./worker')
    .then((m) => m.processDueJobs({ itemIds }))
    .catch((err) => console.error('[etsy] okamžité zpracování selhalo (plánovač to zopakuje)', err instanceof Error ? err.message : err));
}
