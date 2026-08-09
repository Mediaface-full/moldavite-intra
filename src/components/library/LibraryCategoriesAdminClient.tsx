'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import Icon from '../Icon';

type Category = { id: number; name: string; sortOrder: number; bookCount: number };

export default function LibraryCategoriesAdminClient({
  initialCategories,
}: { initialCategories: Category[] }) {
  const router = useRouter();
  const [cats, setCats] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch('/api/library/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sortOrder: cats.length * 10 }),
    });
    setBusy(false);
    if (res.ok) {
      const cat = await res.json();
      setCats((prev) => [...prev, { ...cat, bookCount: 0 }]);
      setAdding(false);
      setNewName('');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `HTTP ${res.status}`);
    }
  }

  async function renameCategory(cat: Category) {
    const name = editName.trim();
    if (!name || name === cat.name) { setEditingId(null); return; }
    const res = await apiFetch(`/api/library/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setCats((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name } : c)));
      setEditingId(null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Přejmenování selhalo: ${data.error ?? res.status}`);
    }
  }

  async function deleteCategory(cat: Category) {
    if (cat.bookCount > 0) {
      if (!confirm(`Kategorie „${cat.name}" má ${cat.bookCount} knih. Smazáním se knihy přesunou do „bez kategorie". Pokračovat?`)) return;
    } else {
      if (!confirm(`Smazat kategorii „${cat.name}"?`)) return;
    }
    const res = await apiFetch(`/api/library/categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) {
      setCats((prev) => prev.filter((c) => c.id !== cat.id));
      router.refresh();
    } else {
      alert(`Mazání selhalo: ${res.status}`);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Kategorie ({cats.length})</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ background: 'var(--success)' }}
            className="text-white hover:opacity-90 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-opacity inline-flex items-center gap-2"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Přidat
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Např. Šperky, Vltavíny, Mineralogie…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCategory();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); setError(null); }
            }}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={addCategory}
            disabled={busy || newName.trim().length === 0}
            style={{ background: busy || newName.trim().length === 0 ? undefined : 'var(--success)' }}
            className="text-white hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider"
          >
            {busy ? 'Přidávám…' : 'Uložit'}
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(''); setError(null); }}
            className="px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground"
          >
            Zrušit
          </button>
        </div>
      )}
      {error && (
        <div className="px-5 py-2 text-xs text-destructive border-b border-border">{error}</div>
      )}

      {cats.length === 0 && !adding ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Zatím žádné kategorie. Přidej první (např. „Šperky", „Vltavíny", …).
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {cats.map((c) => (
            <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/30">
              {editingId === c.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  onBlur={() => renameCategory(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameCategory(c);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-card border border-border rounded-md px-2 py-1 text-sm"
                />
              ) : (
                <span
                  className="text-sm text-foreground flex-1 cursor-pointer"
                  onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                  title="Klik pro přejmenování"
                >
                  {c.name}
                </span>
              )}
              <span className="text-xs font-mono text-muted-foreground">
                {c.bookCount} {c.bookCount === 1 ? 'kniha' : c.bookCount < 5 ? 'knihy' : 'knih'}
              </span>
              <button
                onClick={() => deleteCategory(c)}
                className="text-muted-foreground hover:text-destructive p-1.5 rounded"
                title="Smazat kategorii"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
