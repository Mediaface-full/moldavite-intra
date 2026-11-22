/**
 * Fronta změn pro Etsy (tabulka EtsyJob). Bezpečnostně kritické události (rezervace, prodej) volají
 * enqueueEtsyJob UVNITŘ své transakce a po commitu kickEtsy — volání Etsy nikdy neblokuje rezervaci.
 * Otevřený job je na kámen a druh max jeden (částečný unikátní index EtsyJob_open_unique).
 */
import { etsyConfigured } from './config';

export type EtsyJobKind = 'sync' | 'activate' | 'deactivate' | 'remove';

type RawDb = { $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => unknown };

export async function enqueueEtsyJob(db: RawDb, itemId: number, kind: EtsyJobKind, reason: string): Promise<void> {
  if (!etsyConfigured()) return;
  await db.$executeRaw`INSERT INTO "EtsyJob" ("itemId", "kind", "reason", "runAfter") VALUES (${itemId}, ${kind}, ${reason}, now()) ON CONFLICT ("itemId", "kind") WHERE "doneAt" IS NULL DO UPDATE SET "runAfter" = now(), "reason" = EXCLUDED."reason", "attempts" = 0`;
}

/** Hned zpracovat joby daných kamenů (na pozadí). Chyba se jen zaloguje — plánovač to zkusí znovu. */
export function kickEtsy(itemIds: number[]): void {
  if (!etsyConfigured() || itemIds.length === 0) return;
  void import('./worker')
    .then((m) => m.processDueJobs({ itemIds }))
    .catch((err) => console.error('[etsy] okamžité zpracování selhalo (plánovač to zopakuje)', err instanceof Error ? err.message : err));
}
