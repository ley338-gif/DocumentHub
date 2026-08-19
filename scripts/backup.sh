#!/usr/bin/env bash
# Document Hub backup — dumps PostgreSQL and document storage TOGETHER into
# one timestamped directory, since neither alone is sufficient to restore a
# working instance (see docs/backup-restore.md). Run from the repo root,
# with the compose stack up.
#
# Usage: scripts/backup.sh [backup-root]   (default backup-root: ./backups)
#
# Consistency note: this takes a live pg_dump (a single consistent
# transactional snapshot, per pg_dump's normal guarantees) and a live tar of
# the storage volume, taken moments apart, not inside one atomic
# transaction spanning both systems. For a pilot deployment's write volume
# this is an acceptable, honestly-documented approximation, not a claim of
# true cross-system atomicity — see docs/backup-restore.md's "Consistency"
# section. If you need a stronger guarantee, stop the api service for the
# duration of the backup (a brief maintenance window).
set -euo pipefail
cd "$(dirname "$0")/.."

# Harmless on real Linux (the variable is simply unused there); prevents
# Git Bash/MSYS on Windows from rewriting in-container paths like
# /app/storage into a Windows filesystem path before docker ever sees them.
export MSYS_NO_PATHCONV=1

BACKUP_ROOT="${1:-./backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
POSTGRES_USER="${POSTGRES_USER:-document_hub}"
POSTGRES_DB="${POSTGRES_DB:-document_hub}"

echo "==> Backing up PostgreSQL database '$POSTGRES_DB'..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$BACKUP_DIR/database.dump"

echo "==> Backing up document storage (STORAGE_DRIVER=${STORAGE_DRIVER:-local})..."
if [ "${STORAGE_DRIVER:-local}" = "local" ]; then
  # Streamed through the running api container rather than touching the
  # named volume by path, so this works regardless of the Docker Compose
  # project name (which determines the volume's actual name).
  docker compose exec -T api tar czf - -C /app/storage . > "$BACKUP_DIR/storage.tar.gz"
else
  echo "    STORAGE_DRIVER=s3 — document files live in your S3-compatible" \
       "provider, not this host. Back them up via that provider's own" \
       "backup/replication/versioning (see docs/backup-restore.md)." \
       > "$BACKUP_DIR/storage.SKIPPED.txt"
fi

APP_VERSION="$(node -p "require('./apps/api/package.json').version" 2>/dev/null || echo unknown)"
DB_SHA256="$(sha256sum "$BACKUP_DIR/database.dump" | cut -d' ' -f1)"
STORAGE_SHA256="n/a"
if [ -f "$BACKUP_DIR/storage.tar.gz" ]; then
  STORAGE_SHA256="$(sha256sum "$BACKUP_DIR/storage.tar.gz" | cut -d' ' -f1)"
fi

# Deliberately contains no secrets — no DATABASE_URL, no JWT_SECRET, no S3
# credentials. Just enough to know what this backup is and verify its
# integrity.
cat > "$BACKUP_DIR/manifest.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "appVersion": "$APP_VERSION",
  "postgresDatabase": "$POSTGRES_DB",
  "storageDriver": "${STORAGE_DRIVER:-local}",
  "files": {
    "database": { "name": "database.dump", "sha256": "$DB_SHA256" },
    "storage": { "name": "storage.tar.gz", "sha256": "$STORAGE_SHA256" }
  }
}
EOF

echo "==> Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
