#!/bin/sh
set -e

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
