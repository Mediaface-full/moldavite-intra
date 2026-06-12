/**
 * Build info — verze + commit hash.
 *
 * `NEXT_PUBLIC_COMMIT_SHA` se inlinuje při buildu (server i klient).
 * V CI ji nastaví GitHub Actions z `github.sha`.
 * Lokálně (npm run dev) zůstane prázdná → fallback "dev".
 *
 * Verze pochází z `package.json` přes import — Next.js zapeče hodnotu do bundle.
 */
import pkg from '../../package.json';

const FULL_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA?.trim() || '';
const SHORT_SHA = FULL_SHA ? FULL_SHA.slice(0, 7) : 'dev';

export const BUILD_INFO = {
  version: pkg.version as string,
  commit: FULL_SHA,
  commitShort: SHORT_SHA,
  /** "v0.1.0 · 9f29ab4" nebo "v0.1.0 · dev" v lokálu */
  label: `v${pkg.version} · ${SHORT_SHA}`,
} as const;
