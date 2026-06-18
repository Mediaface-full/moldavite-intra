/**
 * UI metadata pro typ kazety. Hodnoty jsou string z AttrOption(attrKey="cassetteType"),
 * spravované v /admin/attributes. Pro 4 výchozí hodnoty máme hardcoded
 * barvu+ikonu (Kameny / Opracované kusy / K opracování / Prach); pro vlastní
 * uživatelské typy se použije fallback (neutral barva + obecná box ikona).
 */
import type { IconName } from '@/components/Icon';

export type CassetteTypeMeta = { label: string; color: string; short: string; icon: IconName };

/** Hardcoded meta pro 4 default hodnoty seedované v scripts/seed-attr-options.mjs. */
const KNOWN_META: Record<string, CassetteTypeMeta> = {
  'Kameny':           { label: 'Kameny',           color: 'var(--success)',          short: 'Kameny',      icon: 'cassette-stones' },
  'Opracované kusy':  { label: 'Opracované kusy',  color: 'var(--info)',             short: 'Opracované',  icon: 'cassette-processed' },
  'K opracování':     { label: 'K opracování',     color: 'var(--warning)',          short: 'K opracování',icon: 'cassette-to-process' },
  'Prach':            { label: 'Prach',            color: 'var(--muted-foreground)', short: 'Prach',       icon: 'cassette-dust' },
};

/** Fallback pro user-added cassetteType hodnoty (z /admin/attributes). */
const FALLBACK_META: CassetteTypeMeta = {
  label: '',
  color: 'var(--muted-foreground)',
  short: '',
  icon: 'box',
};

export function getCassetteTypeMeta(value: string): CassetteTypeMeta {
  const known = KNOWN_META[value];
  if (known) return known;
  return { ...FALLBACK_META, label: value, short: value };
}

/** Pro backwards compat (komponenty co stále importují CASSETTE_TYPE_META). */
export const CASSETTE_TYPE_META = new Proxy({} as Record<string, CassetteTypeMeta>, {
  get(_t, key: string) {
    return getCassetteTypeMeta(key);
  },
});
