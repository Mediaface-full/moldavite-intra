'use client';

/**
 * Média (§4 B): hlavní fotka (klik → 360° modal), pás miniatur s výběrem
 * hlavní fotky, film + video inline (dřív schované za MediaToggle), certifikát.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { get360Photos } from '@/lib/utils';
import { apiFetch } from '@/lib/apiFetch';
import StonePhotoWithViewer from '../StonePhotoWithViewer';
import SafeImage from '../SafeImage';
import VideoPlayer from '../VideoPlayer';
import Icon from '../Icon';
import { useItemForm } from './ItemFormProvider';
import AiPhotosButton from '../AiPhotosButton';
import type { ItemMediaInfo } from '@/lib/itemReadiness';

export default function StoneMediaPanel({ media }: { media: ItemMediaInfo }) {
  const router = useRouter();
  const { item, catalogNumber, isAdmin } = useItemForm();
  const shop = media.shop;
  const shopSlots = shop?.slots ?? [];
  const [savingShop, setSavingShop] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<number, boolean>>({});
  const [deciding, setDeciding] = useState<number | null>(null);
  const photos = useMemo(() => get360Photos(item.photoPath), [item.photoPath]);
  const visibleCount = Math.min(photos.length, Math.max(media.photoCount, 0));
  const [preview, setPreview] = useState<number | null>(null); // index fotky zobrazené místo hlavní
  const [settingMain, setSettingMain] = useState(false);
  const mainIndex = Math.max(0, (item.mainPhoto || 1) - 1);
  const shownIndex = preview ?? mainIndex;

  async function setAsMain(index: number) {
    setSettingMain(true);
    try {
      const res = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mainPhoto: index + 1 }),
      });
      if (res.ok) { setPreview(null); router.refresh(); }
      else alert('Nepodařilo se nastavit hlavní foto');
    } finally { setSettingMain(false); }
  }

  /** Ruční výběr fotek pro e-shop; [] = zpět na automatický výběr. */
  async function saveShopPhotos(next: number[]) {
    setSavingShop(true);
    try {
      const res = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopPhotos: next }),
      });
      if (res.ok) router.refresh();
      else alert((await res.json().catch(() => null))?.error || 'Nepodařilo se uložit výběr fotek pro e-shop');
    } finally { setSavingShop(false); }
  }

  function toggleShop(slot: number) {
    if (shopSlots.includes(slot)) return saveShopPhotos(shopSlots.filter((n) => n !== slot));
    if (shopSlots.length >= 4) { alert('Do e-shopu jdou max 4 fotky. Nejdřív některou odeber (klikni na ni a „Odebrat z e-shopu“).'); return; }
    return saveShopPhotos([...shopSlots, slot]);
  }

  async function decide(slot: number, action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm(`Zahodit AI úpravu fotky ${slot}? Do e-shopu půjde originál.`)) return;
    setDeciding(slot);
    try {
      const res = await apiFetch(`/api/items/${item.id}/ai-photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot, action }),
      });
      if (res.ok) router.refresh();
      else alert((await res.json().catch(() => null))?.error || 'Nepodařilo se uložit');
    } finally { setDeciding(null); }
  }

  return (
    <section id="media" className="bg-card border border-border rounded-xl shadow-sm p-4 scroll-mt-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4">
        {/* Hlavní fotka — nebo náhled vybrané miniatury */}
        <div className="flex flex-col">
          {preview === null || !item.photoPath ? (
            <StonePhotoWithViewer photoPath={item.photoPath} evidNumber={catalogNumber} itemId={item.id} mainPhoto={item.mainPhoto} />
          ) : (
            <div className="flex flex-col gap-3 h-full">
              <div className="relative aspect-square bg-white rounded-xl overflow-hidden">
                <SafeImage src={photos[shownIndex]} alt={`Foto ${shownIndex + 1}`} className="absolute inset-0 w-full h-full object-contain" placeholder="iconLabel" />
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md font-mono">foto {shownIndex + 1}</div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button type="button" onClick={() => setAsMain(shownIndex)} disabled={settingMain || shownIndex === mainIndex}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider">
                  {shownIndex === mainIndex ? 'Je hlavní foto' : settingMain ? 'Ukládám…' : 'Nastavit jako hlavní'}
                </button>
                {shop && (
                  <button type="button" onClick={() => toggleShop(shownIndex + 1)} disabled={savingShop || shownIndex === mainIndex}
                    title={shownIndex === mainIndex ? 'Hlavní fotka jde do e-shopu vždy' : undefined}
                    className="bg-card border border-border hover:border-foreground/40 disabled:opacity-50 text-text-2 hover:text-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider">
                    {shopSlots.includes(shownIndex + 1) ? 'Odebrat z e-shopu' : 'Do e-shopu'}
                  </button>
                )}
                <button type="button" onClick={() => setPreview(null)}
                  className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider">
                  Zpět
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Miniatury + film + video + certifikát */}
        <div className="min-w-0 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium inline-flex items-center gap-1.5">
                <Icon name="camera" className="w-3.5 h-3.5" />
                {visibleCount > 0 ? `${visibleCount} fotek` : 'Žádné fotky'}
                {media.has360 && <span style={{ color: 'var(--success)' }}>· 360° ✓</span>}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">hlavní: {item.mainPhoto || 1}</p>
            </div>
            {visibleCount > 0 ? (
              <div className="grid grid-cols-6 lg:grid-cols-8 gap-1.5">
                {photos.slice(0, visibleCount).map((src, i) => (
                  <button key={src} type="button" onClick={() => setPreview(i === mainIndex ? null : i)}
                    title={i === mainIndex ? `Foto ${i + 1} — hlavní` : `Foto ${i + 1}`}
                    className={`relative aspect-square rounded-md overflow-hidden bg-white border-2 transition-colors ${
                      i === mainIndex ? 'border-primary' : i === shownIndex ? 'border-foreground/60' : 'border-transparent hover:border-border'
                    }`}>
                    <SafeImage src={`${src}?w=64`} alt={`Foto ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" placeholder="minimal" />
                    {i === mainIndex && <span className="absolute bottom-0 inset-x-0 bg-primary text-primary-foreground text-[8px] font-mono text-center leading-3">hlavní</span>}
                    {shopSlots.includes(i + 1) && (
                      <span title={`V e-shopu jako ${shopSlots.indexOf(i + 1) + 1}. fotka`}
                        className="absolute top-0.5 right-0.5 min-w-3.5 h-3.5 px-0.5 rounded bg-foreground/80 text-background text-[8px] font-mono leading-[14px] text-center">
                        E{shopSlots.indexOf(i + 1) + 1}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nahraj fotky tlačítkem „Fotky“ v hlavičce, nebo přes FTP do složky kazety.</p>
            )}
          </div>

          {shop && shopSlots.length > 0 && item.photoPath && (
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium inline-flex items-center gap-1.5">
                    <Icon name="cart" className="w-3.5 h-3.5" />
                    Do e-shopu · {shopSlots.length} {shopSlots.length === 1 ? 'fotka' : 'fotky'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {shop.auto ? 'Vybráno automaticky z různých úhlů (čelo, ¾, profil, záda). Změnit: klikni na miniaturu → „Do e-shopu“.' : (
                      <>Vybráno ručně · <button type="button" disabled={savingShop} onClick={() => saveShopPhotos([])} className="underline underline-offset-2 hover:text-foreground">vrátit automatický výběr</button></>
                    )}
                  </p>
                </div>
                {isAdmin && (
                  <AiPhotosButton scope="item" itemId={item.id} label={catalogNumber} photoCount={shopSlots.length} missingCount={shop.missing.length} />
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {shopSlots.map((slot, k) => {
                  const ai = shop.ai[String(slot)];
                  const showAi = !!ai && !showOriginal[slot];
                  const nn = String(slot).padStart(2, '0');
                  const src = showAi ? `/images/${item.photoPath}/ai/${ai.file}?w=384` : `/images/${item.photoPath}/${nn}.jpg?w=384`;
                  const usable = ai && (ai.status === 'ok' || ai.status === 'approved');
                  return (
                    <div key={slot} className="flex flex-col gap-1 min-w-0">
                      <button type="button" onClick={() => ai && setShowOriginal((m) => ({ ...m, [slot]: !m[slot] }))}
                        title={ai ? 'Klik: přepnout AI verze / originál' : `Foto ${slot}`}
                        className={`relative aspect-square rounded-md overflow-hidden bg-white border-2 ${ai?.status === 'suspect' ? 'border-[color:var(--warning)]' : 'border-border'}`}>
                        <SafeImage src={src} alt={`E-shop ${k + 1} · foto ${slot}`} className="absolute inset-0 w-full h-full object-contain" placeholder="minimal" />
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded font-mono">{k + 1}</span>
                        {ai && <span className="absolute bottom-1 right-1 text-[9px] px-1 rounded font-mono text-white" style={{ background: showAi ? 'var(--violet)' : 'rgba(0,0,0,.6)' }}>{showAi ? 'AI' : 'orig.'}</span>}
                      </button>
                      <p className="text-[10px] font-mono leading-tight" style={{ color: !ai ? 'var(--muted-foreground)' : usable ? 'var(--success)' : 'var(--warning)' }}
                        title={ai ? `Shoda obrysu s originálem ${Math.round(ai.score * 100)} %` : undefined}>
                        foto {slot} · {!ai ? 'bez AI' : ai.status === 'suspect' ? `kontrola ${Math.round(ai.score * 100)} %` : ai.status === 'approved' ? 'AI schválena' : 'AI ✓'}
                      </p>
                      {isAdmin && ai && (
                        <div className="flex gap-2 text-[10px] font-mono uppercase tracking-wider">
                          {ai.status === 'suspect' && (
                            <button type="button" disabled={deciding === slot} onClick={() => decide(slot, 'approve')} className="text-text-2 hover:text-foreground">Schválit</button>
                          )}
                          <button type="button" disabled={deciding === slot} onClick={() => decide(slot, 'reject')} className="text-muted-foreground hover:text-destructive">Zahodit</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.values(shop.ai).some((a) => a.status === 'suspect') && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--warning)' }}>
                  U fotky „ke kontrole“ se obrys kamene na AI verzi liší od originálu — AI mohla kámen pozměnit. Do e-shopu zatím jde originál. Porovnej kliknutím a schval, nebo zahoď.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1.5">Film {media.hasFilm ? '' : '— chybí'}</p>
              <div className="rounded-lg overflow-hidden border border-border bg-white aspect-[4/3]">
                {media.hasFilm && item.photoPath ? (
                  <SafeImage src={`/images/${item.photoPath}/flim.jpg`} alt={`Film ${catalogNumber}`} className="w-full h-full object-contain" placeholderLabel="Film není k dispozici" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">flim.jpg nenalezen</div>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium mb-1.5">Video {media.hasVideo ? '' : '— chybí'}</p>
              <div className="rounded-lg overflow-hidden border border-border bg-black aspect-[4/3] flex items-center justify-center">
                {media.hasVideo && item.photoPath ? (
                  <VideoPlayer photoPath={item.photoPath} evidNumber={catalogNumber} />
                ) : (
                  <span className="text-[11px] text-muted-foreground">video.mp4 nenalezeno</span>
                )}
              </div>
            </div>
          </div>

          {/* mt-auto: řádek certifikátu sedí na spodní hraně — zarovnaný s tlačítkem 360° v levém sloupci */}
          <div className="mt-auto border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-2 min-w-0">
              <Icon name="file" className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-mono uppercase tracking-wider text-[11px] text-text-2 font-medium">Certifikát</span>
              {item.certHash ? (
                <span className="font-mono text-foreground truncate" title={item.certHash}>{item.certHash}</span>
              ) : (
                <span className="text-muted-foreground">zatím nevystaven — vznikne prvním otevřením PDF</span>
              )}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <a href={`/api/certificate/${item.id}`} target="_blank" rel="noopener noreferrer" className="text-text-2 hover:text-foreground font-mono uppercase tracking-wider text-[11px] font-medium">PDF</a>
              {item.certHash && <a href={`/verify/${item.certHash}`} target="_blank" rel="noopener noreferrer" className="text-text-2 hover:text-foreground font-mono uppercase tracking-wider text-[11px] font-medium">Ověření ↗</a>}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
