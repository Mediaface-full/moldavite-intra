'use client';

/**
 * Hlavička detailu (§4 A): název, meta, stavové badge, primární akce vlevo,
 * utility vpravo. Primární: stav uložení + Uložit, přepínače E-shop/Etsy
 * (stejný stav jako sekce 5), Označit prodáno. Utility: AI, Hlas, Fotky,
 * Certifikát PDF, Ověření.
 */
import Link from 'next/link';
import Icon from '../Icon';
import AiButton from '../AiButton';
import ItemPhotoUploadModal from '../ItemPhotoUploadModal';
import VoiceInputButton from '../VoiceInputButton';
import { useItemForm } from './ItemFormProvider';
import { StatusBadge, fmtDate, Switch } from './primitives';
import type { LastUpdateInfo } from './types';

const PRICING_META = {
  NEEDS_INPUT: { label: 'Chybí vstupy', tone: 'danger' as const, icon: 'pending' as const },
  NEEDS_REVIEW: { label: 'K revizi', tone: 'warn' as const, icon: 'warning' as const },
  STALE: { label: 'Cena zastaralá', tone: 'info' as const, icon: 'warning' as const },
  OK: { label: 'Cena OK', tone: 'ok' as const, icon: 'ok' as const },
};

export default function StoneDetailHeader({ isAdmin, lastUpdate }: { isAdmin: boolean; lastUpdate: LastUpdateInfo | null }) {
  const { item, formData, setField, saveState, saveNow, catalogNumber, publishBlocked, blockedTitle, applyVoice } = useItemForm();
  const title = formData.name.trim() || `Moldavit ${catalogNumber}`;
  const pricing = item.pricingStatus ? PRICING_META[item.pricingStatus] : null;

  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight leading-tight break-words">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className="font-mono text-foreground">{catalogNumber}</span>
            <span>·</span>
            <Link href={`/boxes/${item.box.id}`} className="hover:text-foreground transition-colors">kazeta <span className="font-mono">{item.box.code}</span></Link>
            {item.order && (
              <>
                <span>·</span>
                <Link href={`/orders/${item.order.id}`} className="hover:text-foreground transition-colors">
                  zakázka <span className="font-mono">{item.order.code}</span>{item.order.title ? ` — ${item.order.title}` : ''}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {pricing && <StatusBadge tone={pricing.tone} icon={pricing.icon} size="md">{pricing.label}</StatusBadge>}
            <StatusBadge tone={formData.onShop ? 'ok' : 'neutral'} icon={formData.onShop ? 'ok' : undefined} size="md"
              title={formData.onShop && item.onShopAt ? `vystaveno ${fmtDate(item.onShopAt)}` : undefined}>
              E-shop {formData.onShop ? (item.onShopAt ? fmtDate(item.onShopAt) : '✓') : '—'}
            </StatusBadge>
            <StatusBadge tone={formData.onEtsy ? 'warn' : 'neutral'} icon={formData.onEtsy ? 'ok' : undefined} size="md"
              title={formData.onEtsy && item.onEtsyAt ? `vystaveno ${fmtDate(item.onEtsyAt)}` : undefined}>
              Etsy {formData.onEtsy ? (item.onEtsyAt ? fmtDate(item.onEtsyAt) : '✓') : '—'}
            </StatusBadge>
            {formData.sold && (
              <StatusBadge tone="danger" icon="cash" size="md" title={item.soldAt ? `prodáno ${fmtDate(item.soldAt)}` : undefined}>
                Prodáno{item.soldAt ? ` ${fmtDate(item.soldAt)}` : ''}
              </StatusBadge>
            )}
            <StatusBadge tone={item.certHash ? 'info' : 'neutral'} icon="file" size="md">
              Certifikát {item.certHash ? '✓' : '—'}
            </StatusBadge>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            {lastUpdate
              ? `naposledy upraveno ${fmtDate(lastUpdate.at, true)}${lastUpdate.by ? ` · ${lastUpdate.by}` : ''}`
              : `vytvořeno / upraveno ${fmtDate(item.updatedAt, true)}`}
          </p>
        </div>
      </div>

      {/* Akce: primární vlevo, utility vpravo */}
      <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <SaveIndicator state={saveState} />
          <button
            type="button"
            onClick={saveNow}
            disabled={saveState === 'saving'}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-4 h-9 rounded-lg text-xs font-mono uppercase tracking-wider font-semibold transition-colors inline-flex items-center gap-2"
            title="Uložit hned (změny se ukládají automaticky 0,8 s po poslední úpravě)"
          >
            <Icon name="save" className="w-4 h-4" />
            Uložit
          </button>
          <span className="w-px h-6 bg-border mx-1" />
          <div className="inline-flex items-center gap-2 bg-card border border-border rounded-lg px-3 h-9" title={blockedTitle}>
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-2 font-medium">E-shop</span>
            <Switch on={formData.onShop} disabled={publishBlocked} color="var(--success)" label="Vystavit na e-shop" title={blockedTitle}
              onToggle={() => { if (publishBlocked) { alert(blockedTitle); return; } setField('onShop', !formData.onShop); }} />
          </div>
          <div className="inline-flex items-center gap-2 bg-card border border-border rounded-lg px-3 h-9" title={blockedTitle}>
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-2 font-medium">Etsy</span>
            <Switch on={formData.onEtsy} disabled={publishBlocked} color="var(--warning)" label="Vystavit na Etsy" title={blockedTitle}
              onToggle={() => { if (publishBlocked) { alert(blockedTitle); return; } setField('onEtsy', !formData.onEtsy); }} />
          </div>
          {formData.sold ? (
            <button type="button" onClick={() => setField('sold', false)}
              className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors">
              Zrušit prodej
            </button>
          ) : (
            <button type="button" onClick={() => setField('sold', true)}
              style={{ color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }}
              className="bg-card border hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5">
              <Icon name="cash" className="w-4 h-4" />
              Označit prodáno
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end text-xs">
          {isAdmin && <AiButton itemId={item.id} catalogNumber={catalogNumber} size="sm" />}
          <VoiceInputButton itemId={item.id} currentVoiceNotes={formData.voiceNotes ?? ''} onApply={applyVoice} />
          <ItemPhotoUploadModal itemId={item.id} catalogNumber={catalogNumber} label="Fotky" />
          <a href={`/api/certificate/${item.id}`} target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 h-9 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5">
            <Icon name="file" className="w-4 h-4" />
            Certifikát PDF
          </a>
          {item.certHash && (
            <a href={`/verify/${item.certHash}`} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground px-2 h-9 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider transition-colors">
              <Icon name="external" className="w-3.5 h-3.5" />
              Ověření
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving') {
    return (
      <span className="text-[11px] font-mono text-muted-foreground inline-flex items-center gap-1.5 min-w-[88px]">
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        Ukládám…
      </span>
    );
  }
  if (state === 'saved') {
    return <span className="text-[11px] font-mono inline-flex items-center gap-1.5 min-w-[88px]" style={{ color: 'var(--success)' }}><Icon name="ok" className="w-3.5 h-3.5" />Uloženo</span>;
  }
  if (state === 'error') {
    return <span className="text-[11px] font-mono inline-flex items-center gap-1.5 min-w-[88px]" style={{ color: 'var(--destructive)' }}><Icon name="error" className="w-3.5 h-3.5" />Chyba uložení</span>;
  }
  return <span className="text-[11px] font-mono text-muted-foreground/70 min-w-[88px]">Autosave zapnut</span>;
}
