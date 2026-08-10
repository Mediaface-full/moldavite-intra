FROM node:22-alpine AS base
# libc6-compat + openssl: Prisma 5.x needs openssl to talk to Postgres;
# without it you'll see "failed to detect libssl/openssl" warnings and
# potential runtime connection failures on Alpine 3.19+.
RUN apk add --no-cache libc6-compat openssl

# ---------- Dependencies ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Builder ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Commit SHA z CI (GitHub Actions: --build-arg COMMIT_SHA=${{ github.sha }}).
# Bez argumentu zůstane "" → klient zobrazí "v0.1.0 · dev".
# NEXT_PUBLIC_ prefix → Next.js inlinuje hodnotu do client bundlu při buildu.
ARG COMMIT_SHA=""
ENV NEXT_PUBLIC_COMMIT_SHA=${COMMIT_SHA}

RUN node node_modules/prisma/build/index.js generate
RUN node node_modules/next/dist/bin/next build

# ---------- Runner ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# pg_dump for backups + su-exec to drop root after fixing volume perms
# poppler-utils: pdftoppm pro generování cover thumbnails PDF knih v /vseved/knihy
RUN apk add --no-cache postgresql16-client su-exec poppler-utils

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone runtime (includes server.js + traced node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma: generated client + CLI (needed for `migrate deploy` at container start)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Extra runtime deps not always traced by Next.js standalone
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=builder /app/node_modules/qrcode ./node_modules/qrcode
# sharp + its native bindings (libvips is bundled inside sharp's prebuilt binary)
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img

# Startup scripts: migrate, bootstrap admin, start server
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/scripts ./scripts
RUN chmod +x ./docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

# Intentionally run as root so the entrypoint can chown the named volume
# /data/photos-cache (owned by root by default) before dropping privileges
# to nextjs via su-exec. See docker-entrypoint.sh.

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
