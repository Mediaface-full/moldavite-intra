'use client';

/**
 * Karta s návodem pro FTP upload fotek kazety.
 * Zobrazí celkovou cestu na NASu a pro každý kámen jeho subfolder.
 * Click-to-copy pro celou cestu i jednotlivé položky.
 */
import { useState } from 'react';
import Icon from './Icon';

export default function FtpUploadInfo({
  boxCode,
  items,
  photosBasePath,
}: {
  boxCode: string;
  items: Array<{ evidNumber: string; hasPhotos: boolean }>;
  photosBasePath: string;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fullPath = `${photosBasePath}/${boxCode}/`;
  const filledCount = items.filter((i) => i.hasPhotos).length;

  async function copy(text: string, isAll: boolean, evidNumber?: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (isAll) {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1500);
      } else if (evidNumber) {
        setCopiedItem(evidNumber);
        setTimeout(() => setCopiedItem(null), 1500);
      }
    } catch {
      // clipboard nedostupný (HTTP, starý browser) — fallback: select
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 border-b border-border flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="upload" className="w-4 h-4" />
          Nahrávání fotek (FTP)
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider ml-2">
            {filledCount}/{items.length} kamenů má fotku
          </span>
        </h3>
        <Icon name="chevron-down" className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Cesta k FTP složce této kazety na NASu. Pro každý kámen je samostatná složka pojmenovaná evidenčním číslem.
              Nahraj fotky jako <code className="font-mono text-foreground bg-muted px-1 rounded">01.jpg</code>, <code className="font-mono text-foreground bg-muted px-1 rounded">02.jpg</code> …
            </p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground overflow-x-auto whitespace-nowrap">
                {fullPath}
              </code>
              <button
                onClick={() => copy(fullPath, true)}
                className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors flex-shrink-0"
                title="Zkopírovat cestu"
              >
                <Icon name={copiedAll ? 'check' : 'duplicate'} className="w-3.5 h-3.5" />
                {copiedAll ? 'Zkopírováno' : 'Kopírovat'}
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-2">
                Složky kamenů ({items.length})
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-60 overflow-y-auto pr-1">
                {items.map((it) => {
                  const itemPath = `${fullPath}${it.evidNumber}/`;
                  return (
                    <button
                      key={it.evidNumber}
                      onClick={() => copy(itemPath, false, it.evidNumber)}
                      className={`group inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-[11px] font-mono transition-colors ${
                        it.hasPhotos
                          ? 'border-border bg-card hover:border-foreground/40'
                          : 'border-dashed border-border bg-muted/30 hover:border-foreground/40'
                      }`}
                      title={`Kliknutím zkopíruj cestu: ${itemPath}`}
                    >
                      <span className={it.hasPhotos ? 'text-foreground' : 'text-muted-foreground'}>
                        {it.evidNumber}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {it.hasPhotos ? (
                          <Icon name="ok" className="w-3 h-3" style={{ color: 'var(--success)' }} />
                        ) : (
                          <Icon name="upload" className="w-3 h-3 text-muted-foreground" />
                        )}
                        <Icon
                          name={copiedItem === it.evidNumber ? 'check' : 'duplicate'}
                          className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-2">
                <Icon name="ok" className="w-3 h-3 inline mr-1" style={{ color: 'var(--success)' }} />
                = složka už obsahuje fotku ·
                <Icon name="upload" className="w-3 h-3 inline ml-1 mr-1" />
                = čeká na nahrání
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
