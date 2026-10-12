'use client';

/**
 * Primitiva redesignovaného detailu kamene (docs/REDESIGN-DETAIL-KAMENE.md §6):
 * SectionCard, StatusBadge, Field (5 typů polí přes třídy), PriceFigure, formátování.
 */
import Icon, { type IconName } from '../Icon';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary';

const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  danger: 'var(--destructive)',
  info: 'var(--info)',
  neutral: 'var(--muted-foreground)',
  primary: 'var(--primary)',
};

export function toneColor(t: Tone): string {
  return TONE_COLOR[t];
}

export function StatusBadge({ tone, icon, children, title, size = 'sm' }: {
  tone: Tone; icon?: IconName; children: React.ReactNode; title?: string; size?: 'sm' | 'md';
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border font-mono uppercase tracking-wider whitespace-nowrap ${size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      {icon && <Icon name={icon} className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />}
      {children}
    </span>
  );
}

/** Číslovaná sekce — trvale otevřená karta s nadpisem, popiskem a volitelnými akcemi. */
export function SectionCard({ id, number, title, description, icon, actions, children, className = '' }: {
  id: string; number: number; title: string; description?: string; icon?: IconName;
  actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`bg-card border border-border rounded-xl shadow-sm scroll-mt-4 ${className}`}>
      <header className="px-5 py-3 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-foreground inline-flex items-center gap-2">
            <span className="text-muted-foreground">{number}</span>
            {icon && <Icon name={icon} className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="font-semibold">{title}</span>
          </h2>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Popisek pole + volitelné zvýraznění chybějící hodnoty (reviewMode). */
export function Field({ label, icon, missing, hint, children, className = '', lang }: {
  label: string; icon?: IconName; missing?: boolean; hint?: React.ReactNode; children: React.ReactNode; className?: string; lang?: 'EN';
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-mono">
        {icon && <Icon name={icon} className="w-3.5 h-3.5" />}
        {label}
        {lang && <span style={{ color: 'var(--info)' }} className="font-semibold">({lang})</span>}
        {missing && <span className="text-warning font-bold" title="Chybí — kámen je k revizi">·</span>}
      </label>
      <div className={missing ? 'rounded-lg ring-2 ring-warning/60' : ''}>{children}</div>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Třídy pro 5 typů polí (§6). */
export const inputKey = 'w-full bg-background border border-border rounded-lg px-3 h-10 text-base font-mono font-semibold text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';
export const inputStd = 'w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground transition-shadow';
export const inputEn = 'w-full bg-card border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 placeholder:text-muted-foreground transition-shadow border-[color-mix(in_srgb,var(--info)_30%,transparent)] focus:border-[var(--info)] focus:ring-[color-mix(in_srgb,var(--info)_20%,transparent)]';
export const computedBox = 'w-full bg-muted/60 border border-dashed border-border rounded-lg px-3 h-10 inline-flex items-center justify-end gap-2 text-base font-mono font-semibold text-muted-foreground';

export function fmtCzk(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString('cs-CZ')} Kč` : '—';
}

export function fmtDate(iso?: string | null, withTime = false): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return withTime
      ? d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch { return null; }
}

/** Velké číslo s popiskem — doporučená / finální cena, hmotnost. */
export function PriceFigure({ label, value, caption, tone = 'neutral', size = 'md', extra }: {
  label: string; value: string; caption?: React.ReactNode; tone?: Tone; size?: 'md' | 'lg'; extra?: React.ReactNode;
}) {
  const color = tone === 'neutral' ? 'var(--foreground)' : TONE_COLOR[tone];
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{label}</p>
      <p className={`font-semibold tabular-nums leading-tight ${size === 'lg' ? 'text-[28px]' : 'text-[22px]'}`} style={{ color }}>{value}</p>
      {caption && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{caption}</p>}
      {extra}
    </div>
  );
}

/** Dvoustavový přepínač (E-shop / Etsy) — stejný vzhled jako dřív, jen sdílený. */
export function Switch({ on, onToggle, disabled, color, title, label }: {
  on: boolean; onToggle: () => void; disabled?: boolean; color: string; title?: string; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={on}
      style={on && !disabled ? { background: color } : undefined}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ring-inset flex-shrink-0 ${
        disabled ? 'bg-muted ring-border opacity-50 cursor-not-allowed' : on ? 'ring-transparent' : 'bg-muted ring-border'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${on && !disabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}
