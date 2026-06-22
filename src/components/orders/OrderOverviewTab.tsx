'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import { formatWeight, formatWeightStrict, parseDecimalCs } from '@/lib/utils';
import type { SerializedOrder } from './OrderDetailClient';
import Icon from '../Icon';
import SellerPicker from '../SellerPicker';
import NewBoxButton from '../NewBoxButton';
import DecimalInput from '../DecimalInput';

function fmtMoney(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  return `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
}
function fmtDate(d: Date | string | null): string {
  return d ? new Date(d).toLocaleDateString('cs-CZ') : '—';
}

export default function OrderOverviewTab({ order }: { order: SerializedOrder }) {
  const [editMeta, setEditMeta] = useState(false);
  const router = useRouter();

  const totalRecommended = order.items.reduce((s, i) => s + Number(i.finalInternalPriceInclVatCzk ?? 0), 0);
  const totalCosts = order.costs.reduce((s, c) => s + Number(c.amountCzk ?? 0), 0);
  const totalPurchase = Number(order.totalPurchaseAmountCzk ?? 0);

  // Skutecne soucty napric kazetami — porovnani vs deklarace prodejce
  // (rozdil signalizuje ze prodejce nadhodnotil nebo nektere kameny chybi).
  const actualPieces = order.items.length;
  const actualWeight = order.items.reduce((s, i) => s + Number(i.weight ?? 0), 0);
  const declaredPieces = order.declaredPieces ?? 0;
  const declaredWeight = Number(order.declaredWeight ?? 0);

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile label="Nákup celkem" value={fmtMoney(totalPurchase)} color="var(--muted-foreground)" />
        <KpiTile label="Společné náklady" value={fmtMoney(totalCosts)} color="var(--info)" />
        <KpiTile label="Doporučená tržba (vč. DPH)" value={fmtMoney(totalRecommended)} color="var(--success)" />
      </div>

      {/* Metadata */}
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Metadata</h3>
          <button
            onClick={() => setEditMeta(!editMeta)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors ${
              editMeta
                ? 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                : 'bg-primary border-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            <Icon name={editMeta ? 'x' : 'edit'} className="w-3.5 h-3.5" />
            {editMeta ? 'Zavřít' : 'Upravit'}
          </button>
        </div>
        <div className="p-5">
          {editMeta ? (
            <MetaForm order={order} onSaved={() => { setEditMeta(false); router.refresh(); }} />
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Item label="Název / poznámka" value={order.title || '—'} />
              <Item label="Dodavatel" value={order.sellerDisplay || order.sellerName || '—'} />
              <Item label="Kontakt" value={order.sellerContact || '—'} />
              <Item label="Datum nákupu" value={fmtDate(order.purchaseDate)} />
              <Item label="Lokalita původu" value={order.originLocality || '—'} />
              <ItemWithDiff
                label="Deklarovaný počet prodejcem"
                value={String(declaredPieces)}
                actualLabel={`Skutečně v evidenci: ${actualPieces}`}
                diff={actualPieces - declaredPieces}
                fmt={(n) => `${n > 0 ? '+' : ''}${n}`}
              />
              <ItemWithDiff
                label="Deklarovaná váha prodejcem"
                value={formatWeight(declaredWeight)}
                actualLabel={`Skutečně v evidenci: ${formatWeightStrict(actualWeight)}`}
                diff={actualWeight - declaredWeight}
                fmt={(n) => `${n > 0 ? '+' : ''}${n.toFixed(2)} g`}
                mono
              />
              {(() => {
                // Deklarovaná cena za gram = explicitní defaultPPG nebo dopočet z totalPurchase / declaredWeight.
                // Pokud uživatel nezadal defaultPPG ale máme nákup + váhu, ukážeme „auto" výpočet.
                const explicit = Number(order.defaultPurchasePricePerGramCzk ?? 0);
                const totalPurchase = Number(order.totalPurchaseAmountCzk ?? 0);
                const decW = Number(order.declaredWeight ?? 0);
                const computed = totalPurchase > 0 && decW > 0 ? totalPurchase / decW : 0;
                const effective = explicit > 0 ? explicit : computed;
                const source = explicit > 0 ? 'explicit' : computed > 0 ? 'auto' : 'none';
                const display = effective > 0 ? `${effective.toFixed(2)} Kč/g` : '—';
                const hint = source === 'auto'
                  ? `Dopočet: ${totalPurchase.toFixed(0)} Kč ÷ ${decW.toFixed(2)} g`
                  : source === 'explicit' && computed > 0 && Math.abs(computed - explicit) >= 0.5
                    ? `Dopočet by byl ${computed.toFixed(2)} Kč/g (rozdíl ${(explicit - computed).toFixed(2)})`
                    : null;
                return (
                  <div>
                    <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">Deklarovaná cena za gram</dt>
                    <dd className="text-sm text-foreground font-mono">{display}</dd>
                    {hint && (
                      <dd className="text-[11px] font-mono mt-1 text-muted-foreground">{hint}</dd>
                    )}
                  </div>
                );
              })()}
              <Item label="Měna nákupu" value={order.sourceCurrency} mono />
              <Item label="Poslední přepočet" value={fmtDate(order.lastCalculatedAt)} mono />
            </dl>
          )}
          {order.notes && !editMeta && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">Poznámky</p>
              <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Boxes assigned — detailed cards s aggregací; empty state když 0 */}
      {order.boxes.length > 0 ? (
        <BoxesSummaryCard order={order} />
      ) : (
        <BoxesEmptyState order={order} />
      )}

      {/* Validace součtů jako warning */}
      <SumValidationWarnings order={order} />
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">{label}</dt>
      <dd className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * Item s 2. radkem zobrazujicim skutecne soucty + diff vs deklarace.
 * Diff barevne: zelene OK (|diff| < 0.5), oranzove warning (vetsi rozdil).
 */
function ItemWithDiff({
  label, value, actualLabel, diff, fmt, mono,
}: {
  label: string;
  value: string;
  actualLabel: string;
  diff: number;
  fmt: (n: number) => string;
  mono?: boolean;
}) {
  const hasDiff = Math.abs(diff) >= 0.5;
  const diffColor = hasDiff ? 'var(--warning)' : 'var(--success)';
  const diffSymbol = hasDiff ? '⚠' : '✓';
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">{label}</dt>
      <dd className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
      <dd className="text-sm font-mono mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground">{actualLabel}</span>
        <span style={{ color: diffColor }} className="font-semibold">
          {diffSymbol} {fmt(diff)}
        </span>
      </dd>
    </div>
  );
}

function MetaForm({ order, onSaved }: { order: SerializedOrder; onSaved: () => void }) {
  const [title, setTitle] = useState(order.title);
  const [sellerId, setSellerId] = useState<number | null>(order.sellerId ?? null);
  const [sellerName, setSellerName] = useState(order.sellerName);
  const [sellerContact, setSellerContact] = useState(order.sellerContact);
  const [purchaseDate, setPurchaseDate] = useState(order.purchaseDate ? new Date(order.purchaseDate).toISOString().slice(0, 10) : '');
  const [originLocality, setOriginLocality] = useState(order.originLocality);
  const [declaredPieces, setDeclaredPieces] = useState(String(order.declaredPieces));
  const [declaredWeight, setDeclaredWeight] = useState(order.declaredWeight ?? '');
  const [totalPurchase, setTotalPurchase] = useState(order.totalPurchaseAmountCzk ?? '0');
  const [defaultPPG, setDefaultPPG] = useState(order.defaultPurchasePricePerGramCzk ?? '');
  const [notes, setNotes] = useState(order.notes);
  const [saving, setSaving] = useState(false);

  // Auto-výpočet PPG z totalPurchase / declaredWeight — pomáhá uživateli zjistit
  // co by tam mělo být, když pole nechá prázdné. Pokud uživatel explicitně zadá
  // PPG, jeho hodnota přebije.
  const computedPPG = (() => {
    const t = Number(totalPurchase);
    const w = Number(declaredWeight);
    if (Number.isFinite(t) && Number.isFinite(w) && t > 0 && w > 0) {
      return (t / w).toFixed(2);
    }
    return null;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, sellerId, sellerName, sellerContact,
        purchaseDate: purchaseDate || null,
        originLocality,
        declaredPieces: parseInt(declaredPieces, 10) || 0,
        declaredWeight: declaredWeight === '' ? null : parseDecimalCs(String(declaredWeight)),
        totalPurchaseAmountCzk: parseDecimalCs(String(totalPurchase)) || 0,
        totalPurchaseAmountSource: parseDecimalCs(String(totalPurchase)) || 0,
        defaultPurchasePricePerGramCzk: defaultPPG === '' ? null : parseDecimalCs(String(defaultPPG)),
        defaultPurchasePricePerGramSource: defaultPPG === '' ? null : parseDecimalCs(String(defaultPPG)),
        notes,
      }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else alert('Uložení selhalo');
  }

  const inputCls = 'w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow';
  const labelCls = 'block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono';

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div><label className={labelCls}>Název</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></div>
      <div>
        <label className={labelCls}>Dodavatel</label>
        <SellerPicker value={sellerId} onChange={(id) => setSellerId(id)} />
      </div>
      <div><label className={labelCls}>Kontakt (legacy text)</label><input type="text" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} className={inputCls} placeholder="Doplňková poznámka ke kontaktu" /></div>
      {sellerName && (
        <div className="md:col-span-2 text-[10px] text-muted-foreground font-mono">
          Původní textový prodejce: <span className="text-foreground">{sellerName}</span>
          {' · '}
          <button type="button" onClick={() => setSellerName('')} className="underline hover:text-foreground">Vymazat</button>
        </div>
      )}
      <div><label className={labelCls}>Datum nákupu</label><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} /></div>
      <div><label className={labelCls}>Lokalita</label><input type="text" value={originLocality} onChange={(e) => setOriginLocality(e.target.value)} className={inputCls} /></div>
      <div><label className={labelCls}>Deklarovaný počet prodejcem</label><input type="number" min={0} value={declaredPieces} onChange={(e) => setDeclaredPieces(e.target.value)} className={inputCls} /></div>
      <div>
        <label className={labelCls}>Deklarovaná váha prodejcem (g)</label>
        <DecimalInput
          value={declaredWeight === '' || declaredWeight === null || declaredWeight === undefined ? null : Number(declaredWeight)}
          onChange={(n) => setDeclaredWeight(n === null ? '' : String(n))}
          placeholder="—"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Celková nákupní cena (CZK)</label>
        <DecimalInput
          value={totalPurchase === '' || totalPurchase === null ? null : Number(totalPurchase)}
          onChange={(n) => setTotalPurchase(n === null ? '0' : String(n))}
          placeholder="0"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Deklarovaná cena za gram (Kč/g)</label>
        <DecimalInput
          value={defaultPPG === '' || defaultPPG === null || defaultPPG === undefined ? null : Number(defaultPPG)}
          onChange={(n) => setDefaultPPG(n === null ? '' : String(n))}
          placeholder={computedPPG ? `auto: ${computedPPG}` : '—'}
          className={inputCls}
        />
        {computedPPG && (
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            Vypočítáno z celkové ceny a deklarované váhy: <strong className="text-foreground">{computedPPG} Kč/g</strong>
            {defaultPPG === '' && ' (použije se pokud necháš pole prázdné)'}
          </p>
        )}
      </div>
      <div className="md:col-span-2"><label className={labelCls}>Poznámky</label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} /></div>
      <div className="md:col-span-2 flex gap-2">
        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">{saving ? 'Ukládám…' : 'Uložit'}</button>
      </div>
    </form>
  );
}

/**
 * Empty state pro zakázku bez kazet — invitující CTA na založení.
 * Zakázky bez kazet jsou ve workflow normální (nově vytvořená zakázka má 0
 * kazet, dokud uživatel nezaloží první), takže není to error/warning, jen hint.
 */
function BoxesEmptyState({ order }: { order: SerializedOrder }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
      <Icon name="box" className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
      <h3 className="text-base font-semibold mb-1">Žádná kazeta v zakázce</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
        Zakázka zatím neobsahuje žádné kazety. Založ první kazetu — dodavatel z této zakázky se předvyplní.
      </p>
      <div className="inline-block">
        <NewBoxButton orderId={order.id} defaultSellerId={order.sellerId} variant="primary" />
      </div>
    </div>
  );
}

/**
 * Karta s přehledem kazet zakázky — pro každou kazetu: typ, dodavatel,
 * počet items vs. declaredPieces, Σ doporučené ceny + Σ váha.
 * MIX badge když dodavatel kazety ≠ dodavatel zakázky.
 */
function BoxesSummaryCard({ order }: { order: SerializedOrder }) {
  // Group items by boxId
  const itemsByBox = new Map<number, typeof order.items>();
  for (const it of order.items) {
    const arr = itemsByBox.get(it.boxId) ?? [];
    arr.push(it);
    itemsByBox.set(it.boxId, arr);
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="box" className="w-4 h-4" />
          Přiřazené kazety ({order.boxes.length})
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hidden md:inline">
            součty: doporučená cena + váha
          </span>
          <NewBoxButton orderId={order.id} defaultSellerId={order.sellerId} variant="button" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {order.boxes.map((b) => {
          const items = itemsByBox.get(b.id) ?? [];
          const itemCount = items.length;
          const sumRecommended = items.reduce((s, i) => s + Number(i.finalInternalPriceInclVatCzk ?? 0), 0);
          const sumWeight = Number(b.declaredWeight ?? 0) || items.reduce((s, i) => s + Number(i.weight ?? 0), 0);
          // Effective PPG = jaký Kč/g se reálně použije v cenotvorbě pro tuto kazetu
          //   1. explicit Box.purchasePricePerGramCzk
          //   2. dopočet Box.purchaseAmountCzk / Box.declaredWeight
          //   3. fallback na Order default (zobrazeno jen pro transparentnost)
          //   4. dopočet Order.totalPurchaseAmountCzk / Order.declaredWeight (5. úroveň resolve.ts)
          const boxAmount = Number(b.purchaseAmountCzk ?? 0);
          const boxDeclWeight = Number(b.declaredWeight ?? 0);
          const orderTotalAmount = Number(order.totalPurchaseAmountCzk ?? 0);
          const orderDeclWeight = Number(order.declaredWeight ?? 0);
          let effectivePpg: number | null = null;
          let ppgSource: 'box' | 'compute' | 'order' | 'order-compute' = 'order';
          if (b.purchasePricePerGramCzk && Number(b.purchasePricePerGramCzk) > 0) {
            effectivePpg = Number(b.purchasePricePerGramCzk); ppgSource = 'box';
          } else if (boxAmount > 0 && boxDeclWeight > 0) {
            effectivePpg = boxAmount / boxDeclWeight; ppgSource = 'compute';
          } else if (order.defaultPurchasePricePerGramCzk && Number(order.defaultPurchasePricePerGramCzk) > 0) {
            effectivePpg = Number(order.defaultPurchasePricePerGramCzk); ppgSource = 'order';
          } else if (orderTotalAmount > 0 && orderDeclWeight > 0) {
            effectivePpg = orderTotalAmount / orderDeclWeight; ppgSource = 'order-compute';
          }
          const mix = order.sellerId != null && b.sellerId != null && b.sellerId !== order.sellerId;
          const declaredVsActual = b.declaredPieces != null && b.declaredPieces > 0 && b.declaredPieces !== itemCount;
          // Pocet kamenu vyzadujicich pozornost (NEEDS_INPUT + NEEDS_REVIEW) — pro warning chip per kazeta.
          const attentionCount = items.filter((i) => i.pricingStatus === 'NEEDS_INPUT' || i.pricingStatus === 'NEEDS_REVIEW').length;

          return (
            <Link
              key={b.id}
              href={`/boxes/${b.id}`}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-foreground">{b.code}</span>
                  {b.name && <span className="text-xs text-muted-foreground">· {b.name}</span>}
                  {b.cassetteType && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded border border-border">
                      {b.cassetteType}
                    </span>
                  )}
                  {mix && (
                    <span
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}
                      title="Dodavatel této kazety se liší od dodavatele zakázky"
                    >
                      MIX
                    </span>
                  )}
                  {attentionCount > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider"
                      style={{ color: '#FFFFFF', background: 'var(--warning)' }}
                      title={`${attentionCount} ${attentionCount === 1 ? 'kámen vyžaduje' : 'kamenů vyžaduje'} pozornost (bez vstupů nebo k revizi)`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      {attentionCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Kameny</p>
                <p className={`text-sm font-mono ${declaredVsActual ? 'text-warning' : 'text-foreground'}`} title={declaredVsActual ? `Deklarováno ${b.declaredPieces}, skutečně ${itemCount}` : undefined}>
                  {itemCount}{declaredVsActual ? ` / ${b.declaredPieces}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Σ váha (g)</p>
                <p className="text-sm font-mono text-foreground">{sumWeight.toFixed(2)}</p>
              </div>
              <div className="text-right min-w-20">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">PPG</p>
                <p
                  className="text-sm font-mono"
                  style={{ color: effectivePpg === null ? 'var(--muted-foreground)' : (ppgSource === 'order' || ppgSource === 'order-compute') ? 'var(--muted-foreground)' : 'var(--foreground)' }}
                  title={
                    effectivePpg === null ? 'Žádný PPG zdroj — kámen půjde do NEEDS_INPUT'
                    : ppgSource === 'box' ? 'Explicit PPG kazety'
                    : ppgSource === 'compute' ? `Dopočet z ${boxAmount.toFixed(0)} ÷ ${boxDeclWeight.toFixed(2)}`
                    : ppgSource === 'order' ? 'Explicit defaultPPG zakázky'
                    : `Dopočet z ${orderTotalAmount.toFixed(0)} ÷ ${orderDeclWeight.toFixed(2)} (zakázka)`
                  }
                >
                  {effectivePpg !== null ? `${effectivePpg.toFixed(2)}` : '—'}
                </p>
                <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">
                  {ppgSource === 'box' ? 'override' : ppgSource === 'compute' ? 'auto' : ppgSource === 'order' ? 'order' : 'order auto'}
                </p>
              </div>
              <div className="text-right min-w-24">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Σ doporučená</p>
                <p className="text-sm font-mono" style={{ color: sumRecommended > 0 ? 'var(--success)' : 'var(--muted-foreground)' }}>
                  {fmtMoney(sumRecommended)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer s Σ + sync tlačítkem */}
      <BoxesSummaryFooter order={order} />
    </div>
  );
}

/**
 * Footer karty s celkovými součty (Σ kazet) a tlačítkem na sync do Order.
 * Když uživatel klikne „Použít součty z kazet", do Order.totalPurchaseAmountCzk
 * (a declaredPieces / declaredWeight) zapíše Σ z Boxů. Smart workflow pro
 * bottom-up zadávání: zadám kazety s cenami → klikem mám sumarizovanou zakázku.
 */
function BoxesSummaryFooter({ order }: { order: SerializedOrder }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const sumPieces = order.boxes.reduce((s, b) => s + (b.declaredPieces ?? 0), 0);
  const sumWeight = order.boxes.reduce((s, b) => s + Number(b.declaredWeight ?? 0), 0);
  const sumPurchase = order.boxes.reduce((s, b) => s + Number(b.purchaseAmountCzk ?? 0), 0);

  const orderPieces = order.declaredPieces || 0;
  const orderWeight = Number(order.declaredWeight ?? 0);
  const orderPurchase = Number(order.totalPurchaseAmountCzk ?? 0);

  const diffPieces = sumPieces !== orderPieces;
  const diffWeight = Math.abs(sumWeight - orderWeight) >= 0.01;
  const diffPurchase = Math.abs(sumPurchase - orderPurchase) >= 1;
  const hasDiff = diffPieces || diffWeight || diffPurchase;

  async function syncToOrder() {
    if (!confirm(`Zapsat součty z kazet do zakázky?\n\n- Počet: ${orderPieces} → ${sumPieces}\n- Váha: ${orderWeight} g → ${sumWeight.toFixed(2)} g\n- Nákup: ${orderPurchase} Kč → ${sumPurchase.toFixed(2)} Kč\n\nTato operace přepíše hodnoty v zakázce.`)) return;
    setSyncing(true);
    const res = await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        declaredPieces: sumPieces,
        declaredWeight: sumWeight,
        totalPurchaseAmountCzk: sumPurchase,
        totalPurchaseAmountSource: sumPurchase,
      }),
    });
    setSyncing(false);
    if (res.ok) router.refresh();
    else alert('Synchronizace selhala');
  }

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-x-5 gap-y-1 text-xs font-mono flex-wrap">
        <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Σ z kazet:</span>
        <span className={diffPieces ? 'text-warning' : 'text-foreground'}>
          {sumPieces} ks{diffPieces && ` (Order ${orderPieces})`}
        </span>
        <span className={diffWeight ? 'text-warning' : 'text-foreground'}>
          {sumWeight.toFixed(2)} g{diffWeight && orderWeight > 0 && ` (Order ${orderWeight})`}
        </span>
        <span className={diffPurchase ? 'text-warning' : 'text-foreground'}>
          {fmtMoney(sumPurchase)}{diffPurchase && orderPurchase > 0 && ` (Order ${fmtMoney(orderPurchase)})`}
        </span>
      </div>
      {hasDiff && sumPieces + sumWeight + sumPurchase > 0 && (
        <button
          onClick={syncToOrder}
          disabled={syncing}
          className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Zapsat Σ z kazet do zakázky (počet, váha, nákupní cena)"
        >
          <Icon name="recalculate" className="w-3.5 h-3.5" />
          {syncing ? 'Synchronizuji…' : 'Použít součty z kazet'}
        </button>
      )}
    </div>
  );
}

/**
 * Warning panel — zobrazí (nesimuluje, nepovolí pokračovat) když:
 *  - Σ Box.declaredPieces ≠ Order.declaredPieces
 *  - Σ Box.declaredWeight ≠ Order.declaredWeight
 *  - Σ Box.purchaseAmountCzk ≠ Order.totalPurchaseAmountCzk
 *  - Σ Items count ≠ Order.declaredPieces (informativní)
 */
function SumValidationWarnings({ order }: { order: SerializedOrder }) {
  const sumBoxDeclared = order.boxes.reduce((s, b) => s + (b.declaredPieces ?? 0), 0);
  const sumBoxWeight = order.boxes.reduce((s, b) => s + Number(b.declaredWeight ?? 0), 0);
  const sumBoxPurchase = order.boxes.reduce((s, b) => s + Number(b.purchaseAmountCzk ?? 0), 0);
  const orderDeclared = order.declaredPieces || 0;
  const orderWeight = Number(order.declaredWeight ?? 0);
  const orderPurchase = Number(order.totalPurchaseAmountCzk ?? 0);
  const actualItems = order.items.length;

  const issues: Array<{ key: string; text: string; severity: 'warning' | 'info' }> = [];

  if (sumBoxDeclared > 0 && orderDeclared > 0 && sumBoxDeclared !== orderDeclared) {
    issues.push({
      key: 'declared',
      severity: 'warning',
      text: `Součet deklarovaných kusů v kazetách (${sumBoxDeclared}) se liší od deklarovaného počtu zakázky (${orderDeclared}). Rozdíl: ${sumBoxDeclared - orderDeclared}.`,
    });
  }
  if (sumBoxWeight > 0 && orderWeight > 0 && Math.abs(sumBoxWeight - orderWeight) >= 0.01) {
    issues.push({
      key: 'weight',
      severity: 'warning',
      text: `Součet deklarované váhy kazet (${sumBoxWeight.toFixed(2)} g) se liší od celkové váhy zakázky (${orderWeight.toFixed(2)} g). Rozdíl: ${(sumBoxWeight - orderWeight).toFixed(2)} g.`,
    });
  }
  // Effective PPG kontrola: Σ Box.purchase ÷ Σ Box.weight by mělo dát PPG
  // blízké Order.defaultPPG. Pokud se liší o víc než 5 %, je to možný neprůhled —
  // některé kazety mají per-Box PPG override který Order PPG nesedí.
  const orderPpg = Number(order.defaultPurchasePricePerGramCzk ?? 0);
  if (orderPpg > 0 && sumBoxPurchase > 0 && sumBoxWeight > 0) {
    const effectivePpg = sumBoxPurchase / sumBoxWeight;
    const ppgDiffPct = Math.abs((effectivePpg - orderPpg) / orderPpg) * 100;
    if (ppgDiffPct > 5) {
      issues.push({
        key: 'ppg',
        severity: 'info',
        text: `Efektivní PPG ze součtu kazet (${effectivePpg.toFixed(2)} Kč/g) se liší od PPG zakázky (${orderPpg.toFixed(2)} Kč/g) o ${ppgDiffPct.toFixed(1)} %. Per-Box cenotvorba je aktivní — kameny v různých kazetách dostanou různý PPG.`,
      });
    }
  }
  if (sumBoxPurchase > 0 && orderPurchase > 0 && Math.abs(sumBoxPurchase - orderPurchase) >= 1) {
    issues.push({
      key: 'purchase',
      severity: 'warning',
      text: `Součet nákupní ceny kazet (${fmtMoney(sumBoxPurchase)}) se liší od celkové nákupní ceny zakázky (${fmtMoney(orderPurchase)}). Rozdíl: ${fmtMoney(sumBoxPurchase - orderPurchase)}.`,
    });
  }
  if (orderDeclared > 0 && actualItems !== orderDeclared) {
    issues.push({
      key: 'actual',
      severity: 'info',
      text: `Skutečný počet kamenů (${actualItems}) ≠ deklarovaný počet (${orderDeclared}). Pokud chybí, použij „Doplnit kameny" v detailu kazety.`,
    });
  }

  if (issues.length === 0) return null;

  return (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'color-mix(in srgb, var(--warning) 20%, transparent)', background: 'color-mix(in srgb, var(--warning) 8%, transparent)' }}>
        <Icon name="warning" className="w-4 h-4" style={{ color: 'var(--warning)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>Kontrola součtů</h3>
        <span className="text-[10px] text-muted-foreground font-mono ml-auto">jen upozornění — neblokuje práci</span>
      </div>
      <ul className="divide-y divide-border">
        {issues.map((iss) => (
          <li key={iss.key} className="px-5 py-2.5 text-sm flex items-start gap-2">
            <Icon
              name={iss.severity === 'warning' ? 'warning' : 'info'}
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{ color: iss.severity === 'warning' ? 'var(--warning)' : 'var(--info)' }}
            />
            <span className="text-foreground">{iss.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
