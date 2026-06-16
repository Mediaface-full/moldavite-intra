#!/bin/sh
set -e

# When started as root, fix ownership of Docker named volumes that would
# otherwise be root-owned and unwritable for the nextjs user, then re-exec
# this same script under the nextjs account.
if [ "$(id -u)" = "0" ]; then
  CACHE_DIR="${THUMB_CACHE_PATH:-/data/photos-cache}"
  mkdir -p "$CACHE_DIR"
  chown -R 1001:1001 "$CACHE_DIR" || echo "[entrypoint] warning: could not chown $CACHE_DIR"

  # Web-resized originals live in a bindmount from the host; Synology DSM
  # can create subdirectories with admin:users ownership or ACLs that block
  # the nextjs uid. Recursively hand the whole tree over to uid 1001 and
  # make sure it's writable. Both ops are idempotent and cheap on a mostly-
  # already-correct tree.
  if [ -n "$PHOTOS_WEB_PATH" ]; then
    mkdir -p "$PHOTOS_WEB_PATH" 2>/dev/null || true
    chown -R 1001:1001 "$PHOTOS_WEB_PATH" 2>/dev/null || echo "[entrypoint] warning: chown on $PHOTOS_WEB_PATH failed"
    chmod -R u+rwX,g+rwX "$PHOTOS_WEB_PATH" 2>/dev/null || true
  fi

  # Same treatment for the originals bindmount — needed for box-photo uploads
  # which the app writes into .../<boxCode>/_box_photos/. Without this, the
  # nextjs user can't mkdir under admin-owned K0001/, K0002/ etc.
  PHOTOS_DIR="${PHOTOS_PATH:-/data/photos}"
  if [ -d "$PHOTOS_DIR" ]; then
    chown -R 1001:1001 "$PHOTOS_DIR" 2>/dev/null || echo "[entrypoint] warning: chown on $PHOTOS_DIR failed"
    chmod -R u+rwX,g+rwX "$PHOTOS_DIR" 2>/dev/null || true
  fi

  # Backup adresáře — /api/admin/backup zapisuje gzip dumpy. Volume jsou
  # vytvořené Dockerem jako root, takže pg_dump běžící pod nextjs uid 1001
  # by jinak hodil EACCES. Defaultní cesty viz src/app/api/admin/backup/route.ts.
  for BACKUP_DIR in \
    "${BACKUP_PATH:-/data/backups/daily}" \
    "${BACKUP_SCHEDULED_PATH:-/data/backups/scheduled}" \
    "$(dirname "${BACKUP_PATH:-/data/backups/daily}")"; do
    if [ -n "$BACKUP_DIR" ]; then
      mkdir -p "$BACKUP_DIR" 2>/dev/null || true
      chown -R 1001:1001 "$BACKUP_DIR" 2>/dev/null || echo "[entrypoint] warning: chown on $BACKUP_DIR failed"
      chmod -R u+rwX,g+rwX "$BACKUP_DIR" 2>/dev/null || true
    fi
  done

  exec su-exec nextjs:nodejs "$0" "$@"
fi

echo "[entrypoint] Healing any previously failed migrations..."
node ./scripts/heal-migrations.mjs || echo "[entrypoint] heal-migrations skipped."

echo "[entrypoint] Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

if [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] ADMIN_PASSWORD is set — ensuring admin user exists..."
  node ./scripts/init-admin.mjs || echo "[entrypoint] init-admin failed; continuing."
else
  echo "[entrypoint] ADMIN_PASSWORD not set — skipping admin bootstrap."
fi

echo "[entrypoint] Starting Next.js server..."
exec node server.js
