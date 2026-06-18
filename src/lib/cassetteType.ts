/**
 * UI metadata pro CassetteType — label, barva chipu, krátký popis, ikona.
 * DB hodnoty enum: STONES, PROCESSED, TO_PROCESS, DUST.
 */
import type { IconName } from '@/components/Icon';

export type CassetteType = 'STONES' | 'PROCESSED' | 'TO_PROCESS' | 'DUST';

export const CASSETTE_TYPES: CassetteType[] = ['STONES', 'PROCESSED', 'TO_PROCESS', 'DUST'];

export const CASSETTE_TYPE_META: Record<CassetteType, { label: string; color: string; short: string; icon: IconName }> = {
  STONES:     { label: 'Kameny',           color: 'var(--success)',          short: 'Kameny',      icon: 'cassette-stones' },
  PROCESSED:  { label: 'Opracované kusy',  color: 'var(--info)',             short: 'Opracované',  icon: 'cassette-processed' },
  TO_PROCESS: { label: 'K opracování',     color: 'var(--warning)',          short: 'K opracování',icon: 'cassette-to-process' },
  DUST:       { label: 'Prach',            color: 'var(--muted-foreground)', short: 'Prach',       icon: 'cassette-dust' },
};
