'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import OrderCostsTab from './OrderCostsTab';
import OrderItemsTab from './OrderItemsTab';
import OrderPricingTab from './OrderPricingTab';
import OrderOverviewTab from './OrderOverviewTab';
import OrderLogsTab from './OrderLogsTab';
import DoubleConfirmDelete from '../DoubleConfirmDelete';
import Icon from '../Icon';
import NewBoxButton from '../NewBoxButton';

type Tab = 'overview' | 'costs' | 'items' | 'pricing' | 'logs';

export type SerializedOrder = {
  id: number;
  code: string;
  title: string;
  sellerName: string;
  sellerContact: string;
  sellerId: number | null;
  sellerDisplay: string | null;
  purchaseDate: string | Date | null;
  declaredPieces: number;
  declaredWeight: string | null;
  originLocality: string;
  notes: string;
  sourceCurrency: string;
  totalPurchaseAmountSource: string | null;
  totalPurchaseAmountCzk: string | null;
  defaultPurchasePricePerGramCzk: string | null;
  allocationMethod: 'BY_WEIGHT' | 'BY_PURCHASE_PRICE' | 'EQUAL_PER_PIECE';
  vatRatePct: string | null;
  roundingStep: number;
  pricingConfigId: number | null;
  status: 'DRAFT' | 'PRICED' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';
  lastCalculatedAt: string | Date | null;
  costs: SerializedCost[];
  items: SerializedItem[];
  boxes: Array<{
    id: number;
    code: string;
    name: string | null;
    sellerId?: number | null;
    cassetteType?: string | null;
    declaredPieces?: number | null;
    declaredWeight?: string | null;
    purchaseAmountCzk?: string | null;
    purchasePricePerGramCzk?: string | null;
  }>;
  pricingConfig: { id: number; name: string; active: boolean } | null;
};

export type SerializedCost = {
  id: number;
  orderId: number;
  typeKey: string;
  label: string;
  allocationMethodOverride: 'BY_WEIGHT' | 'BY_PURCHASE_PRICE' | 'EQUAL_PER_PIECE' | null;
  amountCzk: string | null;
  currency: string;
  note: string;
};

export type SerializedItem = {
  id: number;
  evidNumber: string;
  boxId: number;
  weight: string | null;
  purchasePricePerGramCzk: string | null;
  manualPriceInclVatCzk: string | null;
  recommendedPriceInclVatCzk: string | null;
  computedMinPriceExVatCzk: string | null;
  finalInternalPriceInclVatCzk: string | null;
  allocatedOrderCostCzk: string | null;
  pricingStatus: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE';
  pasShape: string;
  attrDamage: string;
  attrColor: string[];
  attrCollectible: boolean;
  location: string | null;
  box: { id: number; code: string };
};

import { type IconName } from '../Icon';
const STATUS_LABEL: Record<string, { label: string; color: string; icon: IconName }> = {
  DRAFT:     { label: 'Návrh',       color: 'var(--muted-foreground)', icon: 'edit' },
  PRICED:    { label: 'Naceněno',    color: 'var(--info)',             icon: 'calc' },
  PUBLISHED: { label: 'Publikováno', color: 'var(--success)',          icon: 'ok' },
  CANCELLED: { label: 'Stornováno',  color: 'var(--destructive)',      icon: 'ban' },
  ARCHIVED:  { label: 'Archiv',      color: 'var(--muted-foreground)', icon: 'storage' },
};

export default function OrderDetailClient({
  order,
  pricingConfigs,
  isAdmin,
}: {
  order: SerializedOrder;
  pricingConfigs: Array<{ id: number; name: string; active: boolean }>;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const router = useRouter();
  const status = STATUS_LABEL[order.status];

  const staleCount = order.items.filter((i) => i.pricingStatus === 'STALE').length;
  const needsInputCount = order.items.filter((i) => i.pricingStatus === 'NEEDS_INPUT').length;
  const needsReviewCount = order.items.filter((i) => i.pricingStatus === 'NEEDS_REVIEW').length;

  const [recalculating, setRecalculating] = useState(false);
  const [recalcDone, setRecalcDone] = useState<{ ok: number; needsInput: number; needsReview: number } | null>(null);

  async function handleRecalculate() {
    if (recalculating) return;
    setRecalculating(true);
    setRecalcDone(null);
    const res = await apiFetch(`/api/orders/${order.id}/recalculate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const sum = data?.summary;
      if (sum) setRecalcDone({ ok: sum.stonesOk ?? 0, needsInput: sum.stonesNeedingInput ?? 0, needsReview: sum.stonesNeedingReview ?? 0 });
      router.refresh();
      setTimeout(() => setRecalcDone(null), 4000);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Přepočet selhal: ${data.error ?? res.status}`);
    }
    setRecalculating(false);
  }

  async function handleStorno() {
    if (!confirm(`Stornovat zakázku ${order.code}? Ceny kamenů zůstanou jako snapshot, ale výpočty se přestanou aktualizovat.`)) return;
    const res = await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/orders" className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono hover:text-foreground transition-colors">
              ← Zakázky
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight font-mono">{order.code}</h1>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border"
              style={{
                color: status.color,
                background: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${status.color} 30%, transparent)`,
              }}
            >
              <Icon name={status.icon} className="w-3 h-3" />
              {status.label}
            </span>
          </div>
          {order.title && <p className="text-base text-muted-foreground mt-1">{order.title}</p>}
          {order.status === 'CANCELLED' && (
            <p className="text-xs text-destructive font-mono mt-2">
              ⚠ Zakázka stornována — ceny zmrazené k poslednímu přepočtu.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(needsInputCount + needsReviewCount) > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase tracking-wider"
              title={
                needsInputCount > 0 && needsReviewCount > 0
                  ? `${needsInputCount} kamenů bez vstupů + ${needsReviewCount} k revizi`
                  : needsInputCount > 0
                    ? `${needsInputCount} kamenů bez vstupů pro cenu`
                    : `${needsReviewCount} kamenů k revizi (chybí povinná pole)`
              }
              style={{ color: '#FFFFFF', background: 'var(--warning)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {needsInputCount + needsReviewCount} k revizi
            </span>
          )}
          {staleCount > 0 && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)' }}
              title="Cenotvorba se změnila — spusť Přepočítat pro aktualizaci"
            >
              {staleCount} stale
            </span>
          )}
          <NewBoxButton orderId={order.id} defaultSellerId={order.sellerId} variant="button" />
          {recalcDone && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded inline-flex items-center gap-1.5"
              style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}
              title={`OK ${recalcDone.ok} · K revizi ${recalcDone.needsReview} · Bez vstupů ${recalcDone.needsInput}`}
            >
              <Icon name="check" className="w-3 h-3" />
              Přepočítáno · {recalcDone.ok}/{recalcDone.ok + recalcDone.needsInput + recalcDone.needsReview} OK
            </span>
          )}
          <button
            onClick={handleRecalculate}
            disabled={order.status === 'CANCELLED' || recalculating}
            className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
            title={recalculating ? 'Probíhá přepočet…' : 'Spustit přepočet cenotvorby'}
          >
            <Icon name="recalculate" className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Přepočítávám…' : 'Přepočítat'}
          </button>
          {isAdmin && order.status !== 'CANCELLED' && order.status !== 'ARCHIVED' && (
            <button
              onClick={handleStorno}
              style={{
                color: 'var(--destructive)',
                borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
              }}
              className="bg-transparent border hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="ban" className="w-3.5 h-3.5" />
              Storno
            </button>
          )}
          {isAdmin && (
            <DoubleConfirmDelete
              confirmPhrase={order.code}
              label="Smazat"
              what={`zakázku ${order.code}`}
              consequence={
                order.items.length > 0
                  ? `Zakázka obsahuje ${order.items.length} kamenů. Smazání není povolené — nejdřív kameny přesuň jinam, nebo použij Storno (status=CANCELLED), které zachová snapshot cen.`
                  : 'Zakázka je prázdná (žádné kameny). Smazání je definitivní — odstraní i všechny nákladové položky a logy.'
              }
              disabledReason={order.items.length > 0 ? `Zakázka má ${order.items.length} kamenů — nejdřív je přesuň nebo použij Storno.` : null}
              onConfirm={async () => {
                const res = await apiFetch(`/api/orders/${order.id}?confirm=DOUBLE_CHECK`, { method: 'DELETE' });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                router.push('/orders');
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border mb-6">
        <TabBtn label="Přehled" icon="chart-pie" active={tab === 'overview'} onClick={() => setTab('overview')} />
        <TabBtn label="Náklady" icon="cash" active={tab === 'costs'} onClick={() => setTab('costs')} count={order.costs.length} />
        <TabBtn label="Kameny" icon="gem" active={tab === 'items'} onClick={() => setTab('items')} count={order.items.length} />
        <TabBtn label="Cenotvorba" icon="calc" active={tab === 'pricing'} onClick={() => setTab('pricing')} />
        <TabBtn label="Logy" icon="history" active={tab === 'logs'} onClick={() => setTab('logs')} />
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OrderOverviewTab order={order} />}
      {tab === 'costs' && <OrderCostsTab order={order} />}
      {tab === 'items' && <OrderItemsTab order={order} />}
      {tab === 'pricing' && <OrderPricingTab order={order} pricingConfigs={pricingConfigs} />}
      {tab === 'logs' && <OrderLogsTab orderId={order.id} />}
    </div>
  );
}

function TabBtn({ label, active, onClick, count, icon }: { label: string; active: boolean; onClick: () => void; count?: number; icon?: IconName }) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-3 text-sm font-medium transition-colors inline-flex items-center gap-2 ${
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon && <Icon name={icon} className="w-4 h-4" />}
      {label}
      {count !== undefined && (
        <span className="ml-1 text-[10px] font-mono text-muted-foreground">({count})</span>
      )}
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />
      )}
    </button>
  );
}
