'use client';

import { useRef, useState, type DragEvent } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import Icon from '@/components/Icon';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.txt') || lower.endsWith('.epub');
}

export default function UploadModal({
  open, onClose, onComplete,
}: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState<'cs' | 'en'>('cs');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError(`Nepodporovaný formát: ${f.name}. Povolen jen .txt nebo .epub.`);
      return;
    }
    if (f.size > MAX_SIZE) {
      setError(`Soubor ${f.name} je větší než 50 MB (${formatBytes(f.size)}).`);
      return;
    }
    setError('');
    setFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    pickFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!file) { setError('Vyber soubor'); return; }
    if (!title.trim()) { setError('Title je povinný'); return; }
    setUploading(true);

    const form = new FormData();
    form.append('file', file);
    form.append('title', title.trim());
    if (author.trim()) form.append('author', author.trim());
    if (year.trim()) form.append('year', year.trim());
    form.append('language', language);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) form.append('tags', JSON.stringify(tagList));

    const res = await apiFetch('/api/vseved/upload', { method: 'POST', body: form });
    setUploading(false);
    if (res.ok || res.status === 202) {
      setFile(null);
      setTitle('');
      setAuthor('');
      setYear('');
      setLanguage('cs');
      setTags('');
      onComplete();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Upload selhal (${res.status})`);
    }
  }

  function handleClose() {
    if (uploading) return;
    setFile(null);
    setTitle('');
    setAuthor('');
    setYear('');
    setLanguage('cs');
    setTags('');
    setError('');
    setDragOver(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Nahrát knihu</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Drag & drop zone */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
              Soubor
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
                  : file
                    ? 'border-success/40 bg-[color-mix(in_srgb,var(--success)_8%,transparent)]'
                    : 'border-border hover:border-foreground/40 bg-muted/30'
              }`}
            >
              {file ? (
                <>
                  <Icon name="file" className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
                  <p className="text-sm text-foreground font-medium break-all">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">
                    {formatBytes(file.size)} · klikni pro výběr jiného
                  </p>
                </>
              ) : (
                <>
                  <Icon name="upload" className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-foreground font-medium">
                    Přetáhni sem soubor nebo klikni pro výběr
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-2 uppercase tracking-wider">
                    .txt nebo .epub · max 50 MB
                  </p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.epub"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bouška — Moldavity"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Autor</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Bouška"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Rok</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1968"
                min={0}
                max={3000}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Jazyk</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'cs' | 'en')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="cs">Čeština</option>
              <option value="en">Angličtina</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Tagy (čárkou oddělené)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="geologie, lokality"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} disabled={uploading} className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 disabled:opacity-50">
              Zrušit
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              style={{ background: 'var(--success)' }}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploading ? 'Nahrávám…' : 'Nahrát'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
