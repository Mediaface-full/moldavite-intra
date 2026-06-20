'use client';

type CitedChunk = {
  id: number;
  documentTitle: string;
  documentAuthor: string;
  documentYear: number | null;
  pageHint: string | null;
  text: string;
  similarity: number;
};

export default function CitationModal({ chunk, onClose }: { chunk: CitedChunk | null; onClose: () => void }) {
  if (!chunk) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{chunk.documentTitle}</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {chunk.documentAuthor}{chunk.documentYear ? ' · ' + chunk.documentYear : ''}{chunk.pageHint ? ' · ' + chunk.pageHint : ''}
            <span className="ml-3 text-muted-foreground/60">similarity: {chunk.similarity.toFixed(3)}</span>
          </p>
        </div>
        <div className="bg-muted/40 border border-border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
          {chunk.text}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
