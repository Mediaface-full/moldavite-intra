/**
 * UI metadata pro CassetteType — label, barva chipu, krátký popis.
 * DB hodnoty enum: STONES, PROCESSED, TO_PROCESS, DUST.
 */
export type CassetteType = 'STONES' | 'PROCESSED' | 'TO_PROCESS' | 'DUST';

export const CASSETTE_TYPES: CassetteType[] = ['STONES', 'PROCESSED', 'TO_PROCESS', 'DUST'];

export const CASSETTE_TYPE_META: Record<CassetteType, { label: string; color: string; short: string }> = {
  STONES:     { label: 'Kameny',           color: 'var(--success)',     short: 'Kameny' },
  PROCESSED:  { label: 'Opracované kusy',  color: 'var(--info)',        short: 'Opracované' },
  TO_PROCESS: { label: 'K opracování',     color: 'var(--warning)',     short: 'K opracování' },
  DUST:       { label: 'Prach',            color: 'var(--muted-foreground)', short: 'Prach' },
};
