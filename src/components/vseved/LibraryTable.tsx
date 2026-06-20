'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import UploadModal from './UploadModal';

type DocSummary = {
  id: number;
  title: string;
  author: string;
  year: number | null;
  language: string;
  format: string;
  fileSize: number;
  chunkCount: number;
  status: string;
  statusError: string | null;
  tags: string[];
  uploadedAt: string;
  indexedAt: string | null;
};

export default function LibraryTable({ initialDocuments }: { initialDocuments: DocSummary[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadOpen, setUploadOpen] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll every 3s if any document is INDEXING or PENDING
  useEffect(() => {
    const hasActive = documents.some((d) => d.status === 'INDEXING' || d.status === 'PENDING');
    if (!hasActive) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await apiFetch('/api/vseved/sources');
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents);
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [documents]);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Smazat knihu "${title}"? Zmizí i všechny její chunky z indexu.`)) return;
    const res = await apiFetch(`/api/vseved/sources/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Smazání selhalo: ${data.error ?? res.status}`);
    }
  }

  function handleUploadComplete() {
    setUploadOpen(false);
    // Force re-fetch sources to show new PENDING document
    apiFetch('/api/vseved/sources').then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        setDocuments(data.documents);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setUploadOpen(true)}
          style={{ background: 'var(--success)' }}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Nahrát knihu
        </button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2">Title / Autor</th>
              <th className="text-center px-3 py-2">Jaz.</th>
              <th className="text-center px-3 py-2">Stav</th>
              <th className="text-right px-3 py-2">Chunky</th>
              <th className="text-right px-3 py-2">Velikost</th>
              <th className="text-right px-3 py-2 w-32">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Knihovna je prázdná. Nahraj první knihu výše.
                </td>
              </tr>
            )}
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.author || '(neznámý autor)'}{doc.year ? ` · ${doc.year}` : ''}
                    {doc.tags.length > 0 && <span> · {doc.tags.join(', ')}</span>}
                  </div>
                  {doc.statusError && (
                    <div className="text-xs text-destructive mt-1">⚠ {doc.statusError}</div>
                  )}
                </td>
                <td className="text-center px-3 py-3 font-mono text-xs uppercase">{doc.language}</td>
                <td className="text-center px-3 py-3">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="text-right px-3 py-3 font-mono text-xs">{doc.chunkCount}</td>
                <td className="text-right px-3 py-3 font-mono text-xs">{formatBytes(doc.fileSize)}</td>
                <td className="text-right px-3 py-3">
                  <button
                    onClick={() => handleDelete(doc.id, doc.title)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Smazat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onComplete={handleUploadComplete} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    PENDING: { bg: 'color-mix(in srgb, var(--muted-foreground) 18%, transparent)', fg: 'var(--muted-foreground)' },
    INDEXING: { bg: 'color-mix(in srgb, var(--info) 18%, transparent)', fg: 'var(--info)' },
    READY: { bg: 'color-mix(in srgb, var(--success) 18%, transparent)', fg: 'var(--success)' },
    FAILED: { bg: 'color-mix(in srgb, var(--destructive) 18%, transparent)', fg: 'var(--destructive)' },
  };
  const c = colors[status] ?? colors.PENDING;
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
