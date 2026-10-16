#!/bin/sh
set -e
echo "[naseebak] syncing database schema…"
./node_modules/.bin/prisma db push
echo "[naseebak] preparing data…"
node docker/init.mjs
echo "[naseebak] starting on port ${PORT:-3000}"
exec ./node_modules/.bin/next start -p "${PORT:-3000}"
