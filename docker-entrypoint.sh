#!/bin/sh
set -e

# When started as root, fix ownership of Docker named volumes that would
# otherwise be root-owned and unwritable for the nextjs user, then re-exec
# this same script under the nextjs account.
if [ "$(id -u)" = "0" ]; then
  CACHE_DIR="${THUMB_CACHE_PATH:-/data/photos-cache}"
  mkdir -p "$CACHE_DIR"
  chown -R 1001:1001 "$CACHE_DIR" || echo "[entrypoint] warning: could not chown $CACHE_DIR"

  # Web-resized originals live in a bindmount from the host; make sure it
  # exists and its top level is writable by the nextjs user (subdirs stay
  # whatever permissions they had from File Station).
  if [ -n "$PHOTOS_WEB_PATH" ]; then
    mkdir -p "$PHOTOS_WEB_PATH" 2>/dev/null || true
    chown 1001:1001 "$PHOTOS_WEB_PATH" 2>/dev/null || echo "[entrypoint] warning: could not chown $PHOTOS_WEB_PATH"
  fi

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
