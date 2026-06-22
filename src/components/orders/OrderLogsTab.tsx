'use client';

/**
 * OrderLogsTab — lidsky čitelný výpis aktivit nad zakázkou.
 *
 * Backend (/api/orders/[id]/logs) vrací posledních 200 záznamů z ActivityLog
 * filtrovaných na zakázku + její kazety + kameny. Tady je převedeme do
 * čitelné podoby: ikonu podle akce, lokalizovaný popis akce, target jako
 * katalogové číslo/kód, a vyextrahované klíčové pole z JSON details.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from '../Icon';
import { apiFetch } from '@/lib/apiFetch';

type LogEntry = {
  id: number;
  action: string;
  target: string;
  details: string;
  createdAt: string;
  user: { email: string; name: string | null } | null;
  targetDisplay: string;
};

const ACTION_LABELS: Record<string, { label: string; icon: IconName; color: string }> = {
  'order.create':           { label: 'Vytvořena zakázka',          icon: 'plus',        color: 'var(--success)' },
  'order.update':           { label: 'Upravena zakázka',           icon: 'edit',        color: 'var(--info)' },
  'order.delete':           { label: 'Smazána zakázka',            icon: 'trash',       color: 'var(--destructive)' },
  'order.recalculate':      { label: 'Přepočet zakázky',           icon: 'recalculate', color: 'var(--primary)' },
  'order.cost.add':         { label: 'Přidán náklad',              icon: 'plus',        color: 'var(--success)' },
  'order.cost.update':      { label: 'Upraven náklad',             icon: 'edit',        color: 'var(--info)' },
  'order.cost.delete':      { label: 'Smazán náklad',              icon: 'trash',       color: 'var(--destructive)' },
  'box.create':             { label: 'Vytvořena kazeta',           icon: 'plus',        color: 'var(--success)' },
  'box.update':             { label: 'Upravena kazeta',            icon: 'edit',        color: 'var(--info)' },
  'box.delete':             { label: 'Smazána kazeta',             icon: 'trash',       color: 'var(--destructive)' },
  'box.placement':          { label: 'Změněno umístění kazety',    icon: 'location',    color: 'var(--info)' },
  'box.photos':             { label: 'Nahrány fotky kazety',       icon: 'camera',      color: 'var(--info)' },
  'item.update':            { label: 'Úprava kamene',              icon: 'edit',        color: 'var(--info)' },
  'item.delete':            { label: 'Smazán kámen',               icon: 'trash',       color: 'var(--destructive)' },
  'item.bulk_update':       { label: 'Hromadná úprava kamenů',     icon: 'edit',        color: 'var(--info)' },
};

// Lidsky popis fieldů pro item.update details (= JSON.stringify(data) v PATCH item).
const FIELD_LABELS: Record<string, string> = {
  name:                          'Název',
  nameEn:                        'Název EN',
  description:                   'Popis',
  descriptionEn:                 'Popis EN',
  longDescription:               'Dlouhý popis',
  longDescriptionEn:             'Dlouhý popis EN',
  location:                      'Místo nálezu',
  storage:                       'Umístění (fyzické)',
  weight:                        'Hmotnost',
  sold:                          'Prodáno',
  onShop:                        'Eshop',
  onEtsy:                        'Etsy',
  pasShape:                      'Tvar',
  attrDamage:                    'Poškození',
  attrColor:                     'Barva',
  attrCollectible:               'Sbírkový',
  manualPriceInclVatCzk:         'Cena speciální',
  purchasePricePerGramCzk:       'Cena za gram (override)',
  mainPhoto:                     'Hlavní fotka',
  upgatesId:                     'Upgates ID',
  etsyId:                        'Etsy ID',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/**
 * Převede `details` na lidskou popisku podle akce.
 *  - item.update: details = JSON.stringify(patch object). Vyextrahuj klíče
 *    + hodnoty (s ohledem na sensible non-stringy: boolean/number/string/array).
 *  - order.update: details = JSON.stringify(Object.keys(data)) → jen seznam upravených polí
 *  - jiné: text už lidsky čitelný (např. „Nahrány 3 fotky")
 */
function describeDetails(action: string, raw: string): string | null {
  if (!raw) return null;

  // Není JSON → vrať jak je
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw;

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return raw; }

  if (action === 'item.update' && typeof parsed === 'object' && parsed) {
    const obj = parsed as Record<string, unknown>;
    const changes: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      // Skipni prázdné stringy a default values co PATCH posílá celé tělo
      if (val === '' || val === null) continue;
      const label = FIELD_LABELS[key] ?? key;
      if (typeof val === 'boolean') {
        changes.push(`${label}: ${val ? 'ano' : 'ne'}`);
      } else if (typeof val === 'number') {
        changes.push(`${label}: ${val}`);
      } else if (typeof val === 'string') {
        // dlouhé texty zkráť
        const short = val.length > 40 ? val.slice(0, 40) + '…' : val;
        changes.push(`${label}: „${short}"`);
      } else if (Array.isArray(val) && val.length > 0) {
        changes.push(`${label}: ${val.join(', ')}`);
      }
    }
    return changes.length > 0 ? changes.join(' · ') : null;
  }

  if (action === 'order.update' && Array.isArray(parsed)) {
    const fields = parsed.map((k) => FIELD_LABELS[k as string] ?? k);
    return `Upravená pole: ${fields.join(', ')}`;
  }

  if (action === 'order.recalculate' && typeof parsed === 'object' && parsed) {
    const o = parsed as { stones?: number; ok?: number; needsInput?: number; needsReview?: number };
    const parts: string[] = [];
    if (typeof o.stones === 'number') parts.push(`${o.stones} kamenů`);
    if (typeof o.ok === 'number') parts.push(`OK: ${o.ok}`);
    if (typeof o.needsReview === 'number' && o.needsReview > 0) parts.push(`K revizi: ${o.needsReview}`);
    if (typeof o.needsInput === 'number' && o.needsInput > 0) parts.push(`Bez vstupů: ${o.needsInput}`);
    return parts.join(' · ');
  }

  if (action === 'order.cost.add' && typeof parsed === 'object' && parsed) {
    const o = parsed as { typeKey?: string; amountCzk?: string };
    return `${o.typeKey ?? 'Náklad'}: ${o.amountCzk ?? '?'} Kč`;
  }

  if (action === 'box.create' && typeof parsed === 'object' && parsed) {
    const o = parsed as { cassetteType?: string };
    return o.cassetteType ? `Typ: ${o.cassetteType}` : null;
  }

  // Fallback: pokud objekt s primitivy, list klíčů
  if (typeof parsed === 'object' && parsed) {
    const keys = Object.keys(parsed);
    return keys.length > 0 ? `${keys.join(', ')}` : null;
  }

  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
}

export default function OrderLogsTab({ orderId }: { orderId: number }) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/orders/${orderId}/logs`);
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs ?? []);
        } else {
          setError(`HTTP ${res.status}`);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Chyba');
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
        <p className="text-destructive font-mono text-sm">Chyba načítání logů: {error}</p>
      </div>
    );
  }

  if (logs === null) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">Načítám…</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
        <p className="text-muted-foreground mb-2">Žádné záznamy v aktivitním logu pro tuto zakázku.</p>
        <p className="text-xs text-muted-foreground font-mono">
          Logy se zaznamenají při úpravách zakázky, kazet, kamenů, nákladů nebo přepočtu.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="history" className="w-4 h-4" />
          Aktivitní log ({logs.length})
        </h3>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          posledních 200 záznamů
        </span>
      </div>
      <ul className="divide-y divide-border">
        {logs.map((l) => {
          const meta = ACTION_LABELS[l.action] ?? { label: l.action, icon: 'info' as IconName, color: 'var(--muted-foreground)' };
          const human = describeDetails(l.action, l.details);
          const isItem = l.action.startsWith('item.');
          const itemHref = isItem ? `/items/${l.target}` : null;
          return (
            <li key={l.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
              <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 mt-0.5"
                  style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  }}
                >
                  <Icon name={meta.icon} className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{meta.label}</span>
                    {l.targetDisplay && (
                      itemHref ? (
                        <Link
                          href={itemHref}
                          className="font-mono text-xs text-primary hover:underline"
                          title="Otevřít kámen"
                        >
                          {l.targetDisplay}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{l.targetDisplay}</span>
                      )
                    )}
                  </div>
                  {human && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{human}</p>
                  )}
                </div>
                <div className="text-right text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                  <p>{fmtDate(l.createdAt)}</p>
                  {l.user && (
                    <p className="mt-0.5">{l.user.name || l.user.email}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
