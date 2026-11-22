'use client';

/**
 * Administrace → Etsy (spec docs/superpowers/specs/2026-11-21-etsy-napojeni-design.md):
 * připojení obchodu, nastavení listingů (výběry z obchodu), přehled stavů, konflikty a chyby.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { fmtInt } from '@/lib/utils';

interface Props {
  configured: boolean;
  notice: 'connected' | 'error' | null;
  connection: { shopName: string; currencyCode: string; connectedAt: string; disconnectedReason: string | null } | null;
  stats: { onEtsy: number; active: number; reservation: number; sold: number; off: number; errors: number; pending: number };
  errors: Array<{ itemId: number; catalogNumber: string; error: string }>;
}
interface Settings {
  taxonomyId: number | null; shippingProfileId: string | null; readinessStateId: string | null; returnPolicyId: string | null;
  whoMade: string; whenMade: string; isSupply: boolean; tags: string[]; materials: string[];
}
interface Options {
  taxonomy: Array<{ id: number; name: string }>;
  shippingProfiles: Array<{ shipping_profile_id: string; title: string }>;
  readinessStates: Array<{ readiness_state_id: string; readiness_state: string; min_processing_time: number; max_processing_time: number; processing_time_unit: string }>;
  returnPolicies: Array<{ return_policy_id: string; accepts_returns: boolean; return_deadline: number | null }>;
}
interface Conflict { id: number; receiptId: string; conflictNote: string | null; processedAt: string }

const lbl = 'text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium';
const input = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm';
const btn = 'px-4 h-9 rounded-lg text-xs font-mono uppercase tracking-wider inline-flex items-center gap-2 border transition-colors disabled:opacity-50';
// Jen stálé hodnoty Etsy (rozsahy po roce 2007 se každý rok mění). Přírodní kámen = before_2007.
const WHEN = ['before_2007', '2000_2006', '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s', '1920s', '1910s', '1900s', '1800s', '1700s', 'before_1700'];

export default function EtsyAdmin({ configured, notice, connection, stats, errors }: Props) {
  const router = useRouter();
  const connected = !!connection && !connection.disconnectedReason;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<{ tags: string[]; materials: string[] }>({ tags: [], materials: [] });
  const [options, setOptions] = useState<Options | null>(null);
  const [optError, setOptError] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [msg, setMsg] = useState('');
  // Štítky/materiály jako text — na seznam se rozdělí až při uložení (jinak by pole mazalo čárku při psaní)
  const [text, setText] = useState({ tags: '', materials: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return;
    apiFetch('/api/etsy/settings').then((r) => r.json()).then((d) => {
      setSettings(d.settings); setDefaults(d.defaults);
      setText({ tags: d.settings.tags.join(', '), materials: d.settings.materials.join(', ') });
    }).catch(() => {});
    apiFetch('/api/etsy/alerts').then((r) => r.json()).then((d) => setConflicts(d.conflicts ?? [])).catch(() => {});
    if (connected) {
      apiFetch('/api/etsy/options').then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setOptions(d); })
        .catch((e) => setOptError(e instanceof Error ? e.message : String(e)));
    }
  }, [configured, connected]);

  async function save() {
    if (!settings) return;
    setBusy(true); setMsg('');
    const split = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);
    const body = { ...settings, tags: split(text.tags), materials: split(text.materials) };
    const res = await apiFetch('/api/etsy/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Uloženo — změny se propíšou do pár minut.' : d.error || 'Nepodařilo se uložit');
    setBusy(false);
  }
  async function syncAll() {
    setBusy(true); setMsg('');
    const res = await apiFetch('/api/etsy/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Zařazeno ${fmtInt(d.queued)} kamenů — propisuje se na pozadí.` : d.error || 'Nepodařilo se spustit');
    setBusy(false);
    router.refresh();
  }
  async function disconnect() {
    if (!confirm('Odpojit obchod na Etsy? Listingy na Etsy zůstanou, jen je intra přestane spravovat.')) return;
    await apiFetch('/api/etsy/connection', { method: 'DELETE' });
    router.refresh();
  }
  async function resolve(id: number) {
    await apiFetch(`/api/etsy/alerts/${id}`, { method: 'POST' });
    setConflicts((c) => c.filter((x) => x.id !== id));
    router.refresh();
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => (s ? { ...s, [k]: v } : s));
  const listField = (k: 'tags' | 'materials') => (
    <input className={input} value={text[k]} placeholder={defaults[k].join(', ')}
      onChange={(e) => { const v = e.target.value; setText((t) => ({ ...t, [k]: v })); }} />
  );

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">Bohemian Moldavite · Intra</p>
        <h1 className="text-3xl font-bold tracking-tight">Etsy</h1>
        <p className="text-sm text-muted-foreground mt-1">Propisování kamenů na Etsy a hlídání, aby se kámen neprodal dvakrát</p>
      </div>

      {notice === 'connected' && <p className="mb-4 text-sm" style={{ color: 'var(--success)' }}>✓ Obchod připojen.</p>}
      {notice === 'error' && <p className="mb-4 text-sm text-destructive">Připojení se nepovedlo — zkus to znovu.</p>}

      {!configured ? (
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-1">Napojení není nastavené</h2>
          <p className="text-sm text-muted-foreground">
            Na NASu chybí proměnné <code>ETSY_KEYSTRING</code>, <code>ETSY_SHARED_SECRET</code> (ze stránky Your Apps na Etsy)
            a <code>ETSY_TOKEN_KEY</code>. Postup je v OPERATIONS.md, sekce Etsy.
          </p>
        </section>
      ) : (
        <>
          <section className="bg-card border border-border rounded-xl p-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className={lbl}>Obchod</p>
              {connected ? (
                <p className="text-base font-semibold">{connection!.shopName} <span className="text-sm text-muted-foreground font-normal">· měna {connection!.currencyCode}</span></p>
              ) : (
                <p className="text-base font-semibold" style={{ color: connection ? 'var(--destructive)' : undefined }}>
                  {connection ? 'Odpojeno — připoj znovu' : 'Nepřipojeno'}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <a href="/api/etsy/oauth/start" className={`${btn} bg-primary text-primary-foreground border-primary`}>{connected ? 'Připojit znovu' : 'Připojit obchod'}</a>
              {connection && <button type="button" onClick={disconnect} className={`${btn} bg-card border-border text-text-2 hover:text-foreground`}>Odpojit</button>}
            </div>
          </section>

          {conflicts.length > 0 && (
            <section className="border-2 rounded-xl p-5 mb-4" style={{ borderColor: 'var(--destructive)' }}>
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--destructive)' }}>Kameny prodané dvakrát — jednu objednávku zruš</h2>
              <ul className="divide-y divide-border">
                {conflicts.map((c) => (
                  <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span>{c.conflictNote} <span className="text-muted-foreground font-mono">· Etsy {c.receiptId}</span></span>
                    <button type="button" onClick={() => resolve(c.id)} className={`${btn} bg-card border-border`}>Vyřešeno</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {([
              ['Na Etsy (zapnuto)', stats.onEtsy, undefined],
              ['Aktivní listingy', stats.active, 'var(--success)'],
              ['Staženo kvůli košíku', stats.reservation, 'var(--warning)'],
              ['Chyby', stats.errors, stats.errors ? 'var(--destructive)' : undefined],
            ] as const).map(([label, n, color]) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <p className={lbl}>{label}</p>
                <p className="text-[28px] font-semibold tabular-nums leading-tight" style={{ color }}>{fmtInt(n)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <button type="button" onClick={syncAll} disabled={busy || !connected} className={`${btn} bg-card border-border hover:border-foreground/40`}>Propsat vše teď</button>
            <span className="text-xs text-muted-foreground">Ve frontě: {fmtInt(stats.pending)} · prodané (stažené): {fmtInt(stats.sold)} · vypnuté / bez ceny: {fmtInt(stats.off)}</span>
            {msg && <span className="text-xs text-text-2">{msg}</span>}
          </div>

          {errors.length > 0 && (
            <section className="bg-card border border-border rounded-xl p-5 mb-4">
              <h2 className="text-sm font-semibold mb-2">Kameny s chybou</h2>
              <ul className="divide-y divide-border max-h-72 overflow-y-auto">
                {errors.map((e) => (
                  <li key={e.itemId} className="py-1.5 text-sm flex gap-3">
                    <Link href={`/items/${e.itemId}`} className="font-mono hover:underline">{e.catalogNumber}</Link>
                    <span className="text-muted-foreground truncate" title={e.error}>{e.error}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {settings && (
            <section className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-1">Nastavení listingů</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Cena = finální cena kamene + provize a zaokrouhlení z <Link href="/export" className="underline">Exporty → Etsy</Link>, přepočtená kurzem ČNB do měny obchodu.
                {optError && <span className="text-destructive"> · Seznamy z Etsy nejdou načíst: {optError}</span>}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block"><span className={lbl}>Kategorie</span>
                  <select className={input} value={settings.taxonomyId ?? ''} onChange={(e) => set('taxonomyId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— vyber —</option>
                    {options?.taxonomy.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className={lbl}>Profil dopravy</span>
                  <select className={input} value={settings.shippingProfileId ?? ''} onChange={(e) => set('shippingProfileId', e.target.value || null)}>
                    <option value="">— vyber —</option>
                    {options?.shippingProfiles.map((p) => <option key={p.shipping_profile_id} value={p.shipping_profile_id}>{p.title}</option>)}
                  </select>
                </label>
                <label className="block"><span className={lbl}>Doba odeslání</span>
                  <select className={input} value={settings.readinessStateId ?? ''} onChange={(e) => set('readinessStateId', e.target.value || null)}>
                    <option value="">— vyber —</option>
                    {options?.readinessStates.map((r) => <option key={r.readiness_state_id} value={r.readiness_state_id}>{r.readiness_state} · {r.min_processing_time}–{r.max_processing_time} {r.processing_time_unit}</option>)}
                  </select>
                </label>
                <label className="block"><span className={lbl}>Vratky</span>
                  <select className={input} value={settings.returnPolicyId ?? ''} onChange={(e) => set('returnPolicyId', e.target.value || null)}>
                    <option value="">— výchozí obchodu —</option>
                    {options?.returnPolicies.map((p) => <option key={p.return_policy_id} value={p.return_policy_id}>{p.accepts_returns ? `Vratky do ${p.return_deadline ?? '?'} dní` : 'Bez vratek'}</option>)}
                  </select>
                </label>
                <label className="block"><span className={lbl}>Kdo vyrobil</span>
                  <select className={input} value={settings.whoMade} onChange={(e) => set('whoMade', e.target.value)}>
                    <option value="someone_else">Někdo jiný (příroda)</option>
                    <option value="i_did">Já</option>
                    <option value="collective">Kolektiv</option>
                  </select>
                </label>
                <label className="block"><span className={lbl}>Kdy vyrobeno</span>
                  <select className={input} value={settings.whenMade} onChange={(e) => set('whenMade', e.target.value)}>
                    {WHEN.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
                <label className="block md:col-span-2"><span className={lbl}>Štítky (max 13, každý max 20 znaků, oddělené čárkou)</span>{listField('tags')}</label>
                <label className="block md:col-span-2"><span className={lbl}>Materiály</span>{listField('materials')}</label>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.isSupply} onChange={(e) => set('isSupply', e.target.checked)} /> Prodávat jako materiál (supply)</label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={save} disabled={busy} className={`${btn} bg-primary text-primary-foreground border-primary`}>Uložit nastavení</button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
