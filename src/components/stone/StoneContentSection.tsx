'use client';

/** Sekce 2 — Obsah a texty: dlouhé popisy CZ a EN vedle sebe (žádný přepínač), text k roztřídění z hlasu. */
import dynamic from 'next/dynamic';
import Icon from '../Icon';
import { useItemForm } from './ItemFormProvider';
import { SectionCard } from './primitives';

const RichTextEditor = dynamic(() => import('../RichTextEditor'), { ssr: false });

function plainLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').trim().length;
}

export default function StoneContentSection() {
  const { formData, setField } = useItemForm();
  const voice = (formData.voiceNotes ?? '').trim();
  return (
    <SectionCard id="content" number={2} title="Obsah a texty" icon="edit" description="Dlouhý popis pro e-shop (HTML). AI texty a hlasový vstup jsou v hlavičce stránky.">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">Dlouhý popis (HTML)</label>
            <span className="text-[11px] text-muted-foreground font-mono">{plainLength(formData.longDescription)} znaků</span>
          </div>
          <RichTextEditor content={formData.longDescription} onChange={(html) => setField('longDescription', html)} placeholder="Podrobný popis pro eshopy…" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium">Dlouhý popis <span style={{ color: 'var(--info)' }} className="font-semibold">(EN)</span></label>
            <span className="text-[11px] text-muted-foreground font-mono">{plainLength(formData.longDescriptionEn)} znaků</span>
          </div>
          <RichTextEditor content={formData.longDescriptionEn} onChange={(html) => setField('longDescriptionEn', html)} placeholder="Detailed description for shops…" />
        </div>
      </div>

      {voice.length > 0 && (
        <div className="mt-4 rounded-lg border-2 p-3" style={{ borderColor: 'color-mix(in srgb, var(--violet) 35%, transparent)', background: 'color-mix(in srgb, var(--violet) 5%, transparent)' }}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono font-medium" style={{ color: 'var(--violet)' }}>
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              Text k roztřídění (z hlasu)
            </label>
            <button type="button" onClick={() => setField('voiceNotes', '')} className="text-[11px] font-mono uppercase tracking-wider text-text-2 font-medium hover:text-destructive transition-colors" title="Smazat — když jsi obsah už zařadil/a kam patří">
              Smazat
            </button>
          </div>
          <textarea value={formData.voiceNotes ?? ''} onChange={(e) => setField('voiceNotes', e.target.value)} rows={3}
            className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Tohle AI nezvládla zařadit do strukturovaných polí. Přesuň ručně do popisu, nebo smaž.</p>
        </div>
      )}
    </SectionCard>
  );
}
