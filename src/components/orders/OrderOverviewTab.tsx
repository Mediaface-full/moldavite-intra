'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import type { SerializedOrder } from './OrderDetailClient';
import Icon from '../Icon';
import SellerPicker from '../SellerPicker';

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
              <Item label="Deklarovaný počet" value={String(order.declaredPieces)} />
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

      {/* Boxes assigned */}
      {order.boxes.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold mb-3">Přiřazené kazety ({order.boxes.length})</h3>
          <div className="flex flex-wrap gap-2">
            {order.boxes.map((b) => {
              const mix = order.sellerId != null && b.sellerId != null && b.sellerId !== order.sellerId;
              return (
                <Link
                  key={b.id}
                  href={`/boxes/${b.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono bg-muted border border-border hover:border-foreground/40 transition-colors"
                >
                  {b.code}
                  {b.name && <span className="text-muted-foreground">· {b.name}</span>}
                  {mix && (
                    <span
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
                        color: 'var(--warning)',
                      }}
                      title="Dodavatel této kazety se liší od dodavatele zakázky"
                    >
                      MIX
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
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

function MetaForm({ order, onSaved }: { order: SerializedOrder; onSaved: () => void }) {
  const [title, setTitle] = useState(order.title);
  const [sellerId, setSellerId] = useState<number | null>(order.sellerId ?? null);
  const [sellerName, setSellerName] = useState(order.sellerName);
  const [sellerContact, setSellerContact] = useState(order.sellerContact);
  const [purchaseDate, setPurchaseDate] = useState(order.purchaseDate ? new Date(order.purchaseDate).toISOString().slice(0, 10) : '');
  const [originLocality, setOriginLocality] = useState(order.originLocality);
  const [declaredPieces, setDeclaredPieces] = useState(String(order.declaredPieces));
  const [totalPurchase, setTotalPurchase] = useState(order.totalPurchaseAmountCzk ?? '0');
  const [notes, setNotes] = useState(order.notes);
  const [saving, setSaving] = useState(false);

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
        totalPurchaseAmountCzk: Number(totalPurchase) || 0,
        totalPurchaseAmountSource: Number(totalPurchase) || 0,
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
      <div><label className={labelCls}>Deklarovaný počet</label><input type="number" min={0} value={declaredPieces} onChange={(e) => setDeclaredPieces(e.target.value)} className={inputCls} /></div>
      <div><label className={labelCls}>Celková nákupní cena (CZK)</label><input type="number" step="0.01" value={totalPurchase} onChange={(e) => setTotalPurchase(e.target.value)} className={inputCls} /></div>
      <div className="md:col-span-2"><label className={labelCls}>Poznámky</label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} /></div>
      <div className="md:col-span-2 flex gap-2">
        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">{saving ? 'Ukládám…' : 'Uložit'}</button>
      </div>
    </form>
  );
}
