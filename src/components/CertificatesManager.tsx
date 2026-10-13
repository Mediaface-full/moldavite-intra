'use client';

/**
 * Admin → Certifikáty (Gideon 13. 10. 2026): přehled vystavených certifikátů, vysvětlení
 * designu (PDF se neukládá) a ZIP čerstvých PDF k tisku po kazetě.
 * Hromadné „vystavit chybějící" odstraněno — číslo certifikátu vzniká samo při prvním
 * otevření PDF nebo při prodeji přes e-shop.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface Stats {
  total: number;
  issued: number;
  missing: number;
  latest: { itemId: number; catalogNumber: string; issuedAt: string | null } | null;
}

interface BoxOption { id: number; code: string; count: number }

export default function CertificatesManager({ boxes }: { boxes: BoxOption[] }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [boxId, setBoxId] = useState<string>(boxes[0] ? String(boxes[0].id) : '');

  useEffect(() => {
    let alive = true;
    apiFetch('/api/admin/certificates')
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (alive) setStats(d); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, []);

  const lbl = 'text-[11px] text-text-2 uppercase tracking-wider font-mono font-medium';
  const btn = 'px-4 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2 border transition-colors';
  const selectedBox = boxes.find((b) => String(b.id) === boxId);

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">Bohemian Moldavite · Intra</p>
        <h1 className="text-3xl font-bold tracking-tight">Certifikáty</h1>
        <p className="text-sm text-muted-foreground mt-1">Přehled vystavených certifikátů a čerstvá PDF k tisku</p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className={lbl}>Kamenů celkem</p>
          <p className="text-[28px] font-semibold tabular-nums leading-tight">{stats ? stats.total : '…'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className={lbl}>S vystaveným certifikátem</p>
          <p className="text-[28px] font-semibold tabular-nums leading-tight" style={{ color: 'var(--success)' }}>{stats ? stats.issued : '…'}</p>
          <p className="text-[11px] text-muted-foreground mt-1">číslo vzniká při prvním otevření PDF nebo při prodeji</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className={lbl}>Zatím bez čísla</p>
          <p className="text-[28px] font-semibold tabular-nums leading-tight">{stats ? stats.missing : '…'}</p>
        </div>
      </div>

      <section className="bg-card border border-border rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-1">Změna designu certifikátu</h2>
        <p className="text-sm text-muted-foreground">
          PDF se nikde neukládá. Při každém otevření (tlačítko „Certifikát PDF“ u kamene, ZIP níže) se vykreslí z aktuálního designu,
          takže po změně designu není co přegenerovat — nová podoba platí hned pro všechny kameny. Číslo certifikátu, ověřovací odkaz
          a QR kód zůstávají stejné, už vytištěné certifikáty tedy dál procházejí ověřením.
        </p>
        {stats?.latest && (
          <a href={`/api/certificate/${stats.latest.itemId}`} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm text-foreground underline underline-offset-2 hover:text-primary">
            Náhled aktuálního designu ({stats.latest.catalogNumber}) ↗
          </a>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-1">Stáhnout PDF k tisku (ZIP)</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Čerstvě vykreslená PDF v aktuálním designu, jeden soubor na kámen. Kamenům bez čísla se přitom číslo certifikátu vystaví.
          Jde to po kazetách (max 50 PDF na jeden ZIP; vykreslení trvá zhruba sekundu na kámen).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={boxId} onChange={(e) => setBoxId(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 h-10 text-sm text-foreground focus:outline-none focus:border-ring">
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.count} ks</option>)}
          </select>
          <a href={boxId ? `/api/admin/certificates/zip?box=${boxId}` : undefined}
            className={`${btn} border-border bg-card text-foreground hover:border-foreground/40 ${boxId ? '' : 'pointer-events-none opacity-50'}`}>
            ↓ ZIP kazety {selectedBox ? `(${selectedBox.count} PDF)` : ''}
          </a>
        </div>
      </section>
    </div>
  );
}
