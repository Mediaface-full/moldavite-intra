/**
 * Build info — verze + codename + commit hash.
 *
 * `NEXT_PUBLIC_COMMIT_SHA` se inlinuje při buildu (server i klient).
 * V CI ji nastaví GitHub Actions z `github.sha`.
 * Lokálně (npm run dev) zůstane prázdná → fallback "dev".
 *
 * Verze pochází z `package.json` přes import — Next.js zapeče hodnotu do bundle.
 * Zobrazené `vX.YY` zkrácení (bez patch části) je dle preference Gideona —
 * codename („Dave") je per-release vtípek v styl Ubuntu (Dapper, Edgy…).
 */
import pkg from '../../package.json';

const FULL_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA?.trim() || '';
const SHORT_SHA = FULL_SHA ? FULL_SHA.slice(0, 7) : 'dev';

// „0.65.0" → „0.65" — patch verze (3. cifra) se v UI zahazuje
const versionShort = pkg.version.split('.').slice(0, 2).join('.');

/** Per-release codename. Měň pri major/minor bump. */
const CODENAME = 'Dave';

export const BUILD_INFO = {
  version: pkg.version as string,
  versionShort,
  codename: CODENAME,
  commit: FULL_SHA,
  commitShort: SHORT_SHA,
  /** „v0.65 Dave" v UI (commit zustava v tooltip pres `commit` field) */
  label: `v${versionShort} ${CODENAME}`,
} as const;
