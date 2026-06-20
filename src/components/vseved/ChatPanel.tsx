'use client';

import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import CitationModal from './CitationModal';

type CitedChunk = {
  id: number;
  documentTitle: string;
  documentAuthor: string;
  documentYear: number | null;
  pageHint: string | null;
  text: string;
  similarity: number;
};

type UIMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; citedChunks: CitedChunk[] };

export default function ChatPanel() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [modalChunk, setModalChunk] = useState<CitedChunk | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setSending(true);

    try {
      const res = await apiFetch('/api/vseved/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: msg, model }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠ Chyba: ${data.error ?? res.status}`, citedChunks: [] }]);
        return;
      }
      const data = await res.json();
      if (!conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.assistantMessage.content,
        citedChunks: data.assistantMessage.citedChunks,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠ Network error: ${err}`, citedChunks: [] }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-muted-foreground font-mono">MODEL:</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setModel('flash')}
            className={`text-xs px-2 py-1 rounded ${model === 'flash' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Flash (rychlé)
          </button>
          <button
            type="button"
            onClick={() => setModel('pro')}
            className={`text-xs px-2 py-1 rounded ${model === 'pro' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Pro (důkladnější, 8× dražší)
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto border border-border rounded-xl bg-card p-4 space-y-4 mb-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-12">
            Začni dotazem — např. „Co víš o lokalitě Marouškovo Pole?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={m.role === 'user'
              ? 'max-w-[80%] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm'
              : 'max-w-[90%] bg-muted rounded-lg px-3 py-3 text-sm space-y-3'}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === 'assistant' && m.citedChunks.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Zdroje</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.citedChunks.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setModalChunk(c)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                      >
                        [{c.documentAuthor}{c.documentYear ? ', ' + c.documentYear : ''}{c.pageHint ? ', ' + c.pageHint : ''}]
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {m.role === 'assistant' && (
                <div className="pt-2 border-t border-border/40">
                  <button
                    onClick={() => navigator.clipboard.writeText(m.content)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    📋 Kopírovat
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="text-sm text-muted-foreground italic">Vševěd přemýšlí…</div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tvoje zpráva pro Vševěda..."
          disabled={sending}
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
        >
          Odeslat
        </button>
      </form>

      <CitationModal chunk={modalChunk} onClose={() => setModalChunk(null)} />
    </>
  );
}
