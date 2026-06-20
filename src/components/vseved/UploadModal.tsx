'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

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

  if (!open) return null;

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
      // Reset form
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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Nahrát knihu</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider">Soubor (.txt / .epub, max 50 MB)</label>
            <input
              type="file"
              accept=".txt,.epub"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
              required
            />
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
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">
              Zrušit
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              style={{ background: 'var(--success)' }}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploading ? 'Nahrávám...' : 'Nahrát'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
