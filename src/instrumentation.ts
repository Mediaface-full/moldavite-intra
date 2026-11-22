/**
 * Spouští se jednou při startu serveru (Next 16 instrumentation). Jen Node runtime a jen když je
 * Etsy nastavené (ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_TOKEN_KEY) — jinak nic nedělá.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { etsyConfigured } = await import('./lib/etsy/config');
  if (!etsyConfigured()) return;
  const { startDefaultEtsyScheduler } = await import('./lib/etsy/scheduler');
  await startDefaultEtsyScheduler();
}
