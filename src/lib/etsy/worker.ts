/** Zpracování fronty EtsyJob — implementace v Task 8 (plán docs/superpowers/plans/2026-11-21-etsy-napojeni.md). */
export async function processDueJobs(_opts?: { itemIds?: number[]; limit?: number }): Promise<{ done: number; failed: number }> {
  return { done: 0, failed: 0 };
}
