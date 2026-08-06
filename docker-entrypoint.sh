#!/bin/sh
set -e

# Bring the SQLite file up to the schema this image was built against.
# Safe to run on every start: applied migrations are skipped.
echo "🗄️  Applying database migrations..."
bunx prisma migrate deploy

exec "$@"
