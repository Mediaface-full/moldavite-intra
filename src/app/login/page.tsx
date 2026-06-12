'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Přihlášení selhalo');
      }
    } catch {
      setError('Chyba připojení');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.svg" alt="Bohemian Moldavite" className="w-full max-w-[260px] h-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Bohemian Moldavite" className="w-full max-w-[260px] h-auto hidden dark:block" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono">Intra · Evidence</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-6 text-center">Přihlášení</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-muted border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-muted border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-shadow"
              />
            </div>

            {error && (
              <p className="text-destructive text-sm bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Přihlašuji…' : 'Přihlásit se'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
