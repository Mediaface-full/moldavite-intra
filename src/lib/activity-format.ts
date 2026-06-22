/**
 * Sdílený formatter pro ActivityLog napříč UI.
 * Používá se v dashboard widgetu, admin /logs page, OrderLogsTab.
 *
 * Cíl: ze záznamu (action, target, details) vrobit lidsky čitelné popisky:
 *  - actionLabel: CZ název akce (např. „Úprava kamene", „Smazána položka číselníku")
 *  - color: barva podle severity (destructive/info/success/primary)
 *  - icon: Heroicons name (mapuje na src/components/Icon.tsx)
 *  - describeDetails(): parsuje JSON details → CZ popisek změn
 *  - friendlyTarget(): pro item.* IDs udělej catalog lookup (K0001-0005)
 *
 * Pro položky číselníku (attr_option.*) ukáže název hodnoty místo „pasShape:Dvojče".
 */
import type { IconName } from '@/components/Icon';

export type ActionMeta = { label: string; icon: IconName; color: string };

export const ACTION_LABELS: Record<string, ActionMeta> = {
  // Order
  'order.create':           { label: 'Vytvořena zakázka',         icon: 'plus',        color: 'var(--success)' },
  'order.update':           { label: 'Upravena zakázka',          icon: 'edit',        color: 'var(--info)' },
  'order.delete':           { label: 'Smazána zakázka',           icon: 'trash',       color: 'var(--destructive)' },
  'order.recalculate':      { label: 'Přepočet zakázky',          icon: 'recalculate', color: 'var(--primary)' },
  'order.cost.add':         { label: 'Přidán náklad',             icon: 'plus',        color: 'var(--success)' },
  'order.cost.update':      { label: 'Upraven náklad',            icon: 'edit',        color: 'var(--info)' },
  'order.cost.delete':      { label: 'Smazán náklad',             icon: 'trash',       color: 'var(--destructive)' },
  // Box
  'box.create':             { label: 'Vytvořena kazeta',          icon: 'plus',        color: 'var(--success)' },
  'box.update':             { label: 'Upravena kazeta',           icon: 'edit',        color: 'var(--info)' },
  'box.delete':             { label: 'Smazána kazeta',            icon: 'trash',       color: 'var(--destructive)' },
  'box.placement':          { label: 'Změněno umístění kazety',   icon: 'location',    color: 'var(--info)' },
  'box.photos':             { label: 'Nahrány fotky kazety',      icon: 'camera',      color: 'var(--info)' },
  // Item
  'item.update':            { label: 'Úprava kamene',             icon: 'edit',        color: 'var(--info)' },
  'item.delete':            { label: 'Smazán kámen',              icon: 'trash',       color: 'var(--destructive)' },
  'item.bulk_update':       { label: 'Hromadná úprava kamenů',    icon: 'edit',        color: 'var(--info)' },
  // PricingConfig
  'pricing_config.create':  { label: 'Vytvořena cenotvorba',      icon: 'plus',        color: 'var(--success)' },
  'pricing_config.update':  { label: 'Upravena cenotvorba',       icon: 'calc',        color: 'var(--info)' },
  'pricing_config.delete':  { label: 'Smazána cenotvorba',        icon: 'trash',       color: 'var(--destructive)' },
  'pricing_config.activate':{ label: 'Aktivována cenotvorba',     icon: 'ok',          color: 'var(--success)' },
  // Číselníky (AttrOption)
  'attr_option.create':     { label: 'Přidána položka číselníku', icon: 'plus',        color: 'var(--success)' },
  'attr_option.update':     { label: 'Upravena položka číselníku',icon: 'edit',        color: 'var(--info)' },
  'attr_option.delete':     { label: 'Smazána položka číselníku', icon: 'trash',       color: 'var(--destructive)' },
  // Sellers
  'seller.create':          { label: 'Přidán dodavatel',          icon: 'plus',        color: 'var(--success)' },
  'seller.update':          { label: 'Upraven dodavatel',         icon: 'edit',        color: 'var(--info)' },
  'seller.delete':          { label: 'Smazán dodavatel',          icon: 'trash',       color: 'var(--destructive)' },
  // Admin / system
  'admin.backup':           { label: 'Záloha databáze',           icon: 'download',    color: 'var(--info)' },
  'admin.user.create':      { label: 'Vytvořen uživatel',         icon: 'plus',        color: 'var(--success)' },
  'admin.user.update':      { label: 'Upraven uživatel',          icon: 'edit',        color: 'var(--info)' },
  'admin.user.delete':      { label: 'Smazán uživatel',           icon: 'trash',       color: 'var(--destructive)' },
  'admin.log_cleanup':      { label: 'Vyčištění starých logů',    icon: 'trash',       color: 'var(--info)' },
  'admin.thumbnails':       { label: 'Generování náhledů',        icon: 'camera',      color: 'var(--info)' },
  'admin.thumbnails.clear': { label: 'Smazání náhledů',           icon: 'trash',       color: 'var(--info)' },
  'admin.web_resize':       { label: 'Web resize fotek',          icon: 'camera',      color: 'var(--info)' },
  'rates.fetch':            { label: 'Načteny kurzy',             icon: 'refresh',     color: 'var(--info)' },
  'rates.recalc':           { label: 'Přepočet podle kurzů',      icon: 'recalculate', color: 'var(--info)' },
  'auth.login':             { label: 'Přihlášení',                icon: 'user',        color: 'var(--success)' },
  'auth.logout':            { label: 'Odhlášení',                 icon: 'user',        color: 'var(--muted-foreground)' },
  'certificate.generate':   { label: 'Vygenerován certifikát',    icon: 'file',        color: 'var(--info)' },
  // AI / Vševěd
  'ai.generate':            { label: 'AI generování textu',       icon: 'sparkles',    color: 'var(--violet)' },
  'vseved.chat':            { label: 'Vševěd chat',               icon: 'sparkles',    color: 'var(--violet)' },
  'vseved.upload':          { label: 'Vševěd upload zdroje',      icon: 'upload',      color: 'var(--violet)' },
  'vseved.delete':          { label: 'Vševěd smazaný zdroj',      icon: 'trash',       color: 'var(--destructive)' },
};

export function actionMeta(action: string): ActionMeta {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Catch-all dle prefixu
  if (action.startsWith('order.'))   return { label: 'Akce zakázky',  icon: 'order',  color: 'var(--info)' };
  if (action.startsWith('box.'))     return { label: 'Akce kazety',   icon: 'box',    color: 'var(--info)' };
  if (action.startsWith('item.'))    return { label: 'Akce kamene',   icon: 'gem',    color: 'var(--info)' };
  if (action.startsWith('admin.'))   return { label: 'Akce admina',   icon: 'settings', color: 'var(--info)' };
  if (action.startsWith('vseved.'))  return { label: 'Akce Vševěda',  icon: 'sparkles', color: 'var(--violet)' };
  return { label: action, icon: 'info', color: 'var(--muted-foreground)' };
}

// Lokalizace fieldů pro item.update / order.update details
export const FIELD_LABELS: Record<string, string> = {
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
  title:                         'Název',
  sellerName:                    'Dodavatel',
  sellerContact:                 'Kontakt na dodavatele',
  purchaseDate:                  'Datum nákupu',
  originLocality:                'Lokalita původu',
  declaredPieces:                'Počet kamenů (deklarováno)',
  declaredWeight:                'Váha (deklarováno)',
  totalPurchaseAmountCzk:        'Celková nákupní cena',
  defaultPurchasePricePerGramCzk:'Cena za gram (default)',
  notes:                         'Poznámky',
  vatRatePct:                    'DPH (%)',
  roundingStep:                  'Krok zaokrouhlení',
  allocationMethod:              'Metoda alokace',
  status:                        'Stav',
};

/**
 * Lidsky popis target z action+target stringu.
 * Některé akce kódují target jako „klíč:hodnota" (attr_option), jiné jako item.id (item.*).
 * `itemCatalog` mapa (id→K0001-0005) je optional — pro dashboard view ji předáme.
 */
export function friendlyTarget(
  action: string,
  target: string,
  itemCatalog?: Record<string, string>,
): string {
  if (!target) return '';

  // attr_option: target = „pasShape:Dvojče" → vrať jen hodnotu „Dvojče" + tag co je za atribut
  if (action.startsWith('attr_option.')) {
    const m = target.match(/^([a-zA-Z]+):(.+)$/);
    if (m) {
      const attrKey = m[1];
      const value = m[2];
      const attrLabel = FIELD_LABELS[attrKey] ?? attrKey;
      return `${attrLabel}: „${value}"`;
    }
    return target;
  }

  // item.*: target = item id → preferuj katalogové číslo
  if (action.startsWith('item.') && itemCatalog) {
    const code = itemCatalog[target];
    if (code) return code;
  }

  return target;
}

function shortString(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * Parse JSON details → lidsky popis změny.
 * Pokud raw není JSON, vrátí text jak je.
 */
export function describeDetails(action: string, raw: string): string | null {
  if (!raw) return null;
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw;

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return raw; }

  if (action === 'item.update' && typeof parsed === 'object' && parsed) {
    const obj = parsed as Record<string, unknown>;
    const changes: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val === '' || val === null) continue;
      const label = FIELD_LABELS[key] ?? key;
      if (typeof val === 'boolean') {
        changes.push(`${label}: ${val ? 'ano' : 'ne'}`);
      } else if (typeof val === 'number') {
        changes.push(`${label}: ${val}`);
      } else if (typeof val === 'string') {
        changes.push(`${label}: „${shortString(val)}"`);
      } else if (Array.isArray(val) && val.length > 0) {
        changes.push(`${label}: ${val.join(', ')}`);
      }
    }
    return changes.length > 0 ? changes.join(' · ') : null;
  }

  if (action === 'order.update' && Array.isArray(parsed)) {
    const fields = (parsed as string[]).map((k) => FIELD_LABELS[k] ?? k);
    return fields.length > 0 ? `Upravená pole: ${fields.join(', ')}` : null;
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

  if (action === 'attr_option.update' && typeof parsed === 'object' && parsed) {
    const o = parsed as { from?: string; to?: string; cascadedCount?: number };
    if (o.from && o.to) {
      const tail = o.cascadedCount ? ` · změna přenesena na ${o.cascadedCount} kamenů` : '';
      return `Přejmenováno „${o.from}" → „${o.to}"${tail}`;
    }
  }

  if (action.startsWith('vseved.upload') && typeof parsed === 'object' && parsed) {
    const o = parsed as { title?: string; format?: string; size?: number };
    return [o.title ? `„${o.title}"` : null, o.format, o.size ? `${Math.round(o.size / 1024)} KB` : null]
      .filter(Boolean).join(' · ') || null;
  }

  if (action.startsWith('vseved.') && typeof parsed === 'object' && parsed) {
    const o = parsed as { title?: string };
    return o.title ? `„${o.title}"` : null;
  }

  // Fallback: list klíčů
  if (typeof parsed === 'object' && parsed) {
    const keys = Object.keys(parsed);
    return keys.length > 0 ? keys.join(', ') : null;
  }

  return shortString(raw, 80);
}
