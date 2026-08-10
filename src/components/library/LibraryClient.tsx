'use client';

/**
 * LibraryClient — grid knih + filter kategorie + upload modal (admin).
 *
 * Klik na kartu → nové okno s download URL (PDF inline, EPUB attachment).
 * Admin má i „Smazat" tlačítko na kartě (hover).
 */
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from '../Icon';

type Book = {
  id: number;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  createdAt: string;
};

type Category = {
  id: number;
  name: string;
  sortOrder: number;
  bookCount: number;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconForMime(mime: string): { icon: 'file'; color: string; label: string } {
  if (mime === 'application/pdf') return { icon: 'file', color: 'var(--destructive)', label: 'PDF' };
  if (mime === 'application/epub+zip') return { icon: 'file', color: 'var(--info)', label: 'EPUB' };
  return { icon: 'file', color: 'var(--muted-foreground)', label: mime.split('/')[1] ?? 'FILE' };
}

export default function LibraryClient({
  initialBooks,
  categories,
  isAdmin,
}: {
  initialBooks: Book[];
  categories: Category[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [books, setBooks] = useState(initialBooks);
  const [filter, setFilter] = useState<number | 'all' | 'none'>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showFsImport, setShowFsImport] = useState(false);
  const [generatingCovers, setGeneratingCovers] = useState<null | { done: number; total: number; generated: number; failed: number }>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return books;
    if (filter === 'none') return books.filter((b) => b.categoryId === null);
    return books.filter((b) => b.categoryId === filter);
  }, [books, filter]);

  async function generateCovers() {
    setGeneratingCovers({ done: 0, total: 0, generated: 0, failed: 0 });
    // Volej v smyčce dokud !done (server timeboxne po 50s, vrátí remaining)
    let generated = 0;
    let failed = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const res = await apiFetch('/api/library/covers-generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        alert(`Generování náhledů selhalo (HTTP ${res.status})`);
        setGeneratingCovers(null);
        return;
      }
      const data = await res.json();
      generated += data.generated;
      failed += data.failed;
      total = data.total;
      setGeneratingCovers({
        done: total - data.remaining,
        total,
        generated,
        failed,
      });
      if (data.done) break;
    }
    setTimeout(() => setGeneratingCovers(null), 2500);
    router.refresh();
  }

  async function deleteBook(book: Book) {
    if (!confirm(`Smazat knihu „${book.title}"?\n\nSoubor se odstraní i z disku.`)) return;
    const res = await apiFetch(`/api/library/books/${book.id}`, { method: 'DELETE' });
    if (res.ok) {
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Mazání selhalo: ${data.error ?? res.status}`);
    }
  }

  const noCategory = books.filter((b) => b.categoryId === null).length;

  return (
    <div>
      {/* Filter chips + upload */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip label="Vše" count={books.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              count={c.bookCount}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
            />
          ))}
          {noCategory > 0 && (
            <FilterChip
              label="Bez kategorie"
              count={noCategory}
              active={filter === 'none'}
              onClick={() => setFilter('none')}
            />
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={generateCovers}
              disabled={generatingCovers !== null}
              className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-60"
              title="Vygeneruje JPG náhled první stránky PDF pro všechny knihy co ho ještě nemají"
            >
              <Icon name="camera" className="w-4 h-4" />
              {generatingCovers
                ? `Náhledy ${generatingCovers.done}/${generatingCovers.total}…`
                : 'Vygenerovat náhledy'}
            </button>
            <button
              onClick={() => setShowFsImport(true)}
              className="bg-card border border-border hover:border-foreground/40 text-foreground px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider inline-flex items-center gap-2"
              title="Naimportovat soubory nahrané do /data/library přes FTP / File Station"
            >
              <Icon name="refresh" className="w-4 h-4" />
              Import z FTP
            </button>
            <button
              onClick={() => setShowUpload(true)}
              style={{ background: 'var(--success)' }}
              className="text-white hover:opacity-90 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity inline-flex items-center gap-2"
            >
              <Icon name="upload" className="w-4 h-4" />
              Nahrát knihy
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <p className="text-muted-foreground mb-2">
            {books.length === 0 ? 'Zatím žádné knihy.' : 'V této kategorii nic není.'}
          </p>
          {isAdmin && books.length === 0 && (
            <p className="text-xs text-muted-foreground font-mono">
              Nahraj první knihu tlačítkem „Nahrát knihy" nahoře.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((book) => {
            const meta = iconForMime(book.mimeType);
            return (
              <div
                key={book.id}
                className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-ring/60 hover:shadow-md transition-all flex flex-col"
              >
                <a
                  href={`/api/library/books/${book.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title={`Otevřít „${book.title}" v novém okně`}
                >
                  <BookCover bookId={book.id} meta={meta} />

                  {/* Title + meta */}
                  <div className="p-3 border-t border-border">
                    <p className="text-sm font-medium text-foreground line-clamp-2 mb-1" title={book.title}>
                      {book.title}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      {book.category ? (
                        <span className="truncate" title={book.category.name}>{book.category.name}</span>
                      ) : (
                        <span className="opacity-60">bez kategorie</span>
                      )}
                      <span>{fmtSize(book.size)}</span>
                    </div>
                  </div>
                </a>

                {/* Admin delete tlacitko */}
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteBook(book); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-white rounded-md p-1.5 hover:opacity-100 shadow-md"
                    title="Smazat knihu"
                    aria-label={`Smazat ${book.title}`}
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showUpload && (
        <UploadModal
          categories={categories}
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); router.refresh(); }}
        />
      )}
      {showFsImport && (
        <FsImportModal
          categories={categories}
          onClose={() => setShowFsImport(false)}
          onDone={() => { setShowFsImport(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

/**
 * Zkusí načíst /api/library/books/{id}/cover; pokud endpoint vrátí 404 (cover
 * ještě nevygenerovaný nebo EPUB/MOBI), přepne se na placeholder ikonu.
 */
function BookCover({
  bookId,
  meta,
}: {
  bookId: number;
  meta: { icon: 'file'; color: string; label: string };
}) {
  const [hasImg, setHasImg] = useState(true);

  return (
    <div
      className="aspect-[3/4] flex flex-col items-center justify-center p-4 relative overflow-hidden bg-muted/30"
      style={
        hasImg
          ? undefined
          : {
              background: `linear-gradient(135deg, color-mix(in srgb, ${meta.color} 20%, transparent), color-mix(in srgb, ${meta.color} 5%, transparent))`,
            }
      }
    >
      {hasImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/library/books/${bookId}/cover`}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setHasImg(false)}
        />
      ) : (
        <>
          <svg
            className="w-16 h-16 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.25}
            style={{ color: meta.color }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: meta.color, color: '#FFFFFF' }}
          >
            {meta.label}
          </span>
        </>
      )}
    </div>
  );
}

function FilterChip({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
      }`}
    >
      <span>{label}</span>
      <span className={active ? 'opacity-80' : 'opacity-60'}>{count}</span>
    </button>
  );
}

function UploadModal({
  categories,
  onClose,
  onDone,
}: {
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ uploaded: Array<{ id: number; title: string }>; errors: Array<{ filename: string; message: string }> } | null>(null);

  async function upload() {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);
    const form = new FormData();
    for (const f of files) form.append('files', f);
    if (categoryId) form.append('categoryId', categoryId);
    const res = await apiFetch('/api/library/books', { method: 'POST', body: form });
    setUploading(false);
    if (res.ok) {
      const data = await res.json();
      setResult(data);
      if (data.errors.length === 0) {
        setTimeout(onDone, 800);
      }
    } else {
      // Zkus dostat server error message z body (JSON nebo plain text)
      let msg = `HTTP ${res.status}`;
      try {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } else {
          const t = await res.text();
          if (t) msg = t.slice(0, 200);
        }
      } catch { /* ignore */ }
      const totalMb = (files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1);
      alert(
        `Upload selhal (${res.status})\n\n${msg}\n\n` +
        `Poslal jsi ${files.length} souborů, celkem ${totalMb} MB.\n\n` +
        (res.status === 413
          ? 'Body je moc velký — reverzní proxy nebo Next limit. Zkus nahrát méně souborů najednou (max ~50 MB batch).'
          : res.status === 400
          ? 'Chybný požadavek — zkontroluj že soubory jsou PDF nebo EPUB (max 100 MB každý). Detail viz DevTools Console.'
          : '')
      );
      console.error('[Library upload] failed:', { status: res.status, msg, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Nahrát knihy</h2>

        <label className="block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
          Kategorie
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">— bez kategorie —</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        {categories.length === 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Žádné kategorie — přidej v <a href="/admin/library-kategorie" className="text-primary underline">Kategorie knih</a>. Můžeš nahrát i bez kategorie.
          </p>
        )}

        <label className="block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
          Soubory (PDF, EPUB — víc najednou)
        </label>
        <input
          type="file"
          multiple
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full text-sm mb-4"
        />
        {files.length > 0 && (
          <div className="mb-4 text-xs text-muted-foreground font-mono">
            Vybráno {files.length} {files.length === 1 ? 'soubor' : files.length < 5 ? 'soubory' : 'souborů'} · {fmtSize(files.reduce((s, f) => s + f.size, 0))}
          </div>
        )}

        {result && (
          <div className="mb-4 space-y-2">
            {result.uploaded.length > 0 && (
              <div className="px-3 py-2 rounded-md border border-success/30 bg-success/10 text-xs">
                <p className="text-success font-mono uppercase tracking-wider mb-1">✓ Nahráno {result.uploaded.length}</p>
                <ul className="space-y-0.5">
                  {result.uploaded.map((u) => (
                    <li key={u.id} className="text-foreground truncate">• {u.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-xs">
                <p className="text-destructive font-mono uppercase tracking-wider mb-1">✗ Selhalo {result.errors.length}</p>
                <ul className="space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-foreground"><b>{e.filename}</b>: {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Zavřít
          </button>
          <button
            onClick={upload}
            disabled={uploading || files.length === 0}
            style={{ background: uploading || files.length === 0 ? undefined : 'var(--success)' }}
            className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity"
          >
            {uploading ? 'Nahrávám…' : `Nahrát ${files.length > 0 ? files.length : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * FsImportModal — naimportuje soubory nahrané do /data/library přes FTP/File Station.
 * Workflow:
 *  1. Otevřít → dry-run scan (server vrátí co by se importovalo)
 *  2. User vybere kategorii + potvrdí
 *  3. Skutečný import (rename na uuid.ext + INSERT do DB)
 *
 * Obchází HTTP upload limit (Synology reverse proxy default 1 MB).
 */
type FsScanItem = { filename: string; mime: string; size: number };
type FsScanResult = {
  dryRun?: boolean;
  importable?: FsScanItem[];
  skipped?: Array<{ filename: string; reason: string }>;
  imported?: Array<{ id: number; title: string }>;
  errors?: Array<{ filename: string; error: string }>;
  error?: string;
};

function FsImportModal({
  categories,
  onClose,
  onDone,
}: {
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [scan, setScan] = useState<FsScanResult | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');
  const [busy, setBusy] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<FsScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-scan při otevření (dry-run)
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch('/api/library/import-fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!alive) return;
      if (res.ok) {
        setScan(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
      }
      setBusy(false);
    })();
    return () => { alive = false; };
  }, []);

  async function doImport() {
    setImporting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    if (categoryId) payload.categoryId = Number(categoryId);
    const res = await apiFetch('/api/library/import-fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setImporting(false);
    if (res.ok) {
      setImportResult(await res.json());
      setTimeout(onDone, 1200);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `HTTP ${res.status}`);
    }
  }

  const importable = scan?.importable ?? [];
  const skipped = scan?.skipped ?? [];
  const totalBytes = importable.reduce((s, f) => s + f.size, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Import z FTP</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Naimportuje soubory nahrané přes FTP nebo File Station do <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">/volume1/docker/moldavite/library/</code>.
          Přejmenuje je na UUID a přidá do DB.
        </p>

        {busy && <p className="text-sm text-muted-foreground py-4 text-center">Skenuji adresář…</p>}

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            {error}
          </div>
        )}

        {!busy && scan && !importResult && (
          <>
            {importable.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground text-sm">
                Nic k importu — v adresáři nejsou žádné nové soubory.
                {skipped.length > 0 && (
                  <p className="mt-2 text-xs">
                    ({skipped.length} přeskočeno — už v DB nebo nepodporovaný formát)
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4 px-3 py-2 rounded-md bg-primary/10 border border-primary/30">
                  <p className="text-sm font-semibold text-foreground">
                    Nalezeno {importable.length} {importable.length === 1 ? 'soubor' : importable.length < 5 ? 'soubory' : 'souborů'}
                    · {(totalBytes / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>

                <label className="block text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
                  Kategorie pro celý batch
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">— bez kategorie —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>

                <details className="mb-4 text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Seznam ({importable.length})
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-60 overflow-y-auto font-mono">
                    {importable.map((f) => (
                      <li key={f.filename} className="flex items-center justify-between gap-3 py-1 border-b border-border/50">
                        <span className="truncate flex-1">{f.filename}</span>
                        <span className="text-muted-foreground text-[10px]">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </li>
                    ))}
                  </ul>
                </details>

                {skipped.length > 0 && (
                  <details className="mb-4 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Přeskočeno ({skipped.length})
                    </summary>
                    <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto font-mono text-muted-foreground">
                      {skipped.map((s, i) => (
                        <li key={i}>• {s.filename} <span className="opacity-60">— {s.reason}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </>
        )}

        {importResult && (
          <div className="mb-4 space-y-2">
            {importResult.imported && importResult.imported.length > 0 && (
              <div className="px-3 py-2 rounded-md border border-success/30 bg-success/10 text-xs">
                <p className="text-success font-mono uppercase tracking-wider mb-1">✓ Naimportováno {importResult.imported.length}</p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {importResult.imported.map((u) => (
                    <li key={u.id} className="text-foreground truncate">• {u.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {importResult.errors && importResult.errors.length > 0 && (
              <div className="px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-xs">
                <p className="text-destructive font-mono uppercase tracking-wider mb-1">✗ Selhalo {importResult.errors.length}</p>
                <ul className="space-y-0.5">
                  {importResult.errors.map((e, i) => (
                    <li key={i} className="text-foreground"><b>{e.filename}</b>: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {importResult ? 'Zavřít' : 'Zrušit'}
          </button>
          {!importResult && (
            <button
              onClick={doImport}
              disabled={busy || importing || importable.length === 0}
              style={{ background: busy || importing || importable.length === 0 ? undefined : 'var(--success)' }}
              className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity"
            >
              {importing ? 'Importuji…' : `Naimportovat ${importable.length > 0 ? importable.length : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
