'use client';

/**
 * Modal pro rychlé nahrání fotek konkrétního kamene (varianta B z plánu).
 * Drag & drop nebo file picker, JPEG/PNG/WebP, max 10 MB/soubor, max 10 najednou.
 * Nahrává na POST /api/items/[id]/photos. Po úspěchu router.refresh().
 */
import { useState, useRef, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from './Icon';

export default function ItemPhotoUploadModal({
  itemId,
  catalogNumber,
  label = 'Nahrát fotky',
  variant = 'button',
}: {
  itemId: number;
  catalogNumber: string;
  label?: string;
  variant?: 'button' | 'icon';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ added: number; files: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFiles([]);
    setError('');
    setDone(null);
    setUploading(false);
    setDragOver(false);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  const addFiles = useCallback((picked: FileList | File[] | null) => {
    if (!picked) return;
    const arr = Array.from(picked).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (arr.length === 0) {
      setError('Žádné JPEG/PNG/WebP soubory.');
      return;
    }
    setError('');
    setFiles((cur) => [...cur, ...arr].slice(0, 10));
  }, []);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function upload() {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);

    const res = await apiFetch(`/api/items/${itemId}/photos`, { method: 'POST', body: fd });
    setUploading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    setDone({ added: data.added, files: data.files });
    setFiles([]);
    setTimeout(() => {
      close();
      router.refresh();
    }, 1800);
  }

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-card border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground p-1.5 rounded transition-colors"
        title={`${label} pro ${catalogNumber}`}
      >
        <Icon name="upload" className="w-3.5 h-3.5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
      >
        <Icon name="upload" className="w-3.5 h-3.5" />
        {label}
      </button>
    );

  return (
    <>
      {trigger}

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold inline-flex items-center gap-2">
                <Icon name="upload" className="w-5 h-5" />
                Nahrát fotky kamene {catalogNumber}
              </h3>
              <button onClick={close} className="text-muted-foreground hover:text-foreground" title="Zavřít">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {done ? (
                <div className="text-sm">
                  <p className="text-success font-semibold mb-2">
                    <Icon name="ok" className="w-4 h-4 inline mr-1" />
                    Nahráno {done.added} {done.added === 1 ? 'fotka' : done.added < 5 ? 'fotky' : 'fotek'}.
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mb-2">
                    Soubory: {done.files.join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground">Modal se za chvilku zavře…</p>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      dragOver
                        ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
                        : 'border-border hover:border-foreground/40 bg-muted/30'
                    }`}
                  >
                    <Icon name="upload" className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-foreground font-medium">
                      Přetáhni sem fotky nebo klikni pro výběr
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-2 uppercase tracking-wider">
                      JPEG / PNG / WebP · max 10 MB / soubor · max 10 najednou
                    </p>
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => addFiles(e.target.files)}
                      className="hidden"
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-2">
                        Připravené k nahrání ({files.length})
                      </p>
                      <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {files.map((f, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/40 border border-border rounded text-xs">
                            <span className="truncate flex-1 min-w-0 font-mono text-foreground">{f.name}</span>
                            <span className="text-muted-foreground font-mono whitespace-nowrap">
                              {(f.size / 1024).toFixed(0)} kB
                            </span>
                            <button
                              type="button"
                              onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive"
                              title="Odstranit"
                            >
                              <Icon name="x" className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {error && (
                    <p className="mt-3 text-destructive text-xs bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={upload}
                      disabled={uploading || files.length === 0}
                      className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
                    >
                      {uploading ? 'Nahrávám…' : (
                        <>
                          <Icon name="upload" className="w-4 h-4" />
                          Nahrát {files.length > 0 ? `(${files.length})` : ''}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    >
                      Zrušit
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
