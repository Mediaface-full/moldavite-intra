import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Open Graph card shown when the verify URL is shared on social platforms
// (Facebook, Twitter/X, Slack, LinkedIn …). Renders dynamically per stone
// so the preview shows the correct catalog number.

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Bohemian Moldavite — Verified Authentic';

export default async function Image({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  let catalogNumber = '';
  let weight = '';
  try {
    const item = await prisma.item.findFirst({
      where: { certHash: hash },
      include: { box: true },
    });
    if (item) {
      catalogNumber = `${item.box.code}-${item.evidNumber}`;
      weight = `${Number(item.weight).toFixed(2)} g`;
    }
  } catch {
    /* swallow — fall back to generic card */
  }

  // Embed the logo PNG as a Data URI so it works with both the static
  // build and the standalone runtime.
  let logoDataUri = '';
  try {
    const logoPath = join(process.cwd(), 'public', 'logo-pdf.png');
    const buf = await readFile(logoPath);
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    /* card renders without logo if file missing */
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f1f13',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#eaf2eb',
          padding: 80,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUri} alt="Bohemian Moldavite" width={400} height={200} style={{ marginBottom: 40 }} />
        ) : (
          <div style={{ fontSize: 56, fontWeight: 700, color: '#c9a84c', letterSpacing: 2, marginBottom: 8 }}>
            BOHEMIAN
          </div>
        )}
        {!logoDataUri && (
          <div style={{ fontSize: 24, color: '#cdddd0', letterSpacing: 8, marginBottom: 40 }}>
            MOLDAVITE
          </div>
        )}

        <div
          style={{
            background: 'rgba(45, 110, 53, 0.25)',
            border: '2px solid #57a561',
            borderRadius: 999,
            padding: '12px 32px',
            fontSize: 24,
            color: '#85c28d',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
          }}
        >
          ✓ Verified Authentic
        </div>

        <div style={{ fontSize: 56, fontWeight: 700, marginBottom: 8 }}>
          Certificate of Authenticity
        </div>

        {catalogNumber ? (
          <div style={{ fontSize: 32, color: '#a8c4ad', display: 'flex', gap: 24, marginTop: 12 }}>
            <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#c9a84c' }}>{catalogNumber}</span>
            {weight && <span>·</span>}
            {weight && <span>{weight}</span>}
          </div>
        ) : (
          <div style={{ fontSize: 24, color: '#a8c4ad', marginTop: 12 }}>
            Natural Czech tektite from Southern Bohemia
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
