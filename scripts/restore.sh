#!/usr/bin/env bash
# Document Hub restore — the counterpart to scripts/backup.sh. Restores
# PostgreSQL and (for STORAGE_DRIVER=local) document storage from a backup
# directory produced by that script.
#
# Usage: scripts/restore.sh <backup-dir>
#
# Expects the compose stack to already be up with a fresh/empty schema
# (i.e. `docker compose up -d` has already run `migrate` against a clean
# database) — this restores DATA into that schema, it does not create the
# stack. See docs/backup-restore.md for the full fresh-install-then-restore
# procedure.
set -euo pipefail
cd "$(dirname "$0")/.."

# See scripts/backup.sh for why this is set (Git Bash/MSYS path rewriting
# on Windows; a no-op on real Linux).
export MSYS_NO_PATHCONV=1

BACKUP_DIR="${1:?Usage: scripts/restore.sh <backup-dir>}"
if [ ! -f "$BACKUP_DIR/manifest.json" ]; then
  echo "ERROR: $BACKUP_DIR does not look like a backup (no manifest.json)" >&2
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
POSTGRES_USER="${POSTGRES_USER:-document_hub}"
POSTGRES_DB="${POSTGRES_DB:-document_hub}"

echo "==> Verifying backup file integrity against manifest..."
# Pure bash/sha256sum — no Node required on the host. manifest.json's shape
# is controlled entirely by backup.sh (one "sha256": "<hex>" line per file,
# in file-declaration order matching the two lines below), so a plain grep
# is reliable here without needing a real JSON parser on the host.
manifest_hashes=$(grep -o '"sha256": *"[a-f0-9]*"' "$BACKUP_DIR/manifest.json" | grep -o '[a-f0-9]\{64\}')
db_expected=$(echo "$manifest_hashes" | sed -n '1p')
storage_expected=$(echo "$manifest_hashes" | sed -n '2p')

db_actual=$(sha256sum "$BACKUP_DIR/database.dump" | cut -d' ' -f1)
if [ "$db_actual" != "$db_expected" ]; then
  echo "SHA-256 mismatch for database.dump: expected $db_expected, got $db_actual" >&2
  exit 1
fi
echo "  OK  database.dump"

if [ -f "$BACKUP_DIR/storage.tar.gz" ] && [ -n "${storage_expected:-}" ] && [ "$storage_expected" != "" ]; then
  storage_actual=$(sha256sum "$BACKUP_DIR/storage.tar.gz" | cut -d' ' -f1)
  if [ "$storage_actual" != "$storage_expected" ]; then
    echo "SHA-256 mismatch for storage.tar.gz: expected $storage_expected, got $storage_actual" >&2
    exit 1
  fi
  echo "  OK  storage.tar.gz"
fi

echo "==> Restoring PostgreSQL database '$POSTGRES_DB'..."
# --clean --if-exists drops existing objects before recreating them, so
# this is safe to run against the empty-but-migrated schema a fresh install
# leaves behind. -1 wraps the whole restore in a single transaction — a
# failure partway through leaves the database exactly as it was, not
# half-restored.
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists -1 < "$BACKUP_DIR/database.dump"

if [ -f "$BACKUP_DIR/storage.tar.gz" ]; then
  echo "==> Restoring document storage..."
  docker compose exec -T api sh -c "rm -rf /app/storage/* /app/storage/.[!.]* 2>/dev/null; tar xzf - -C /app/storage" < "$BACKUP_DIR/storage.tar.gz"
else
  echo "==> No storage.tar.gz in this backup (STORAGE_DRIVER=s3 at backup time — restore the" \
       "S3-compatible provider's data separately, see docs/backup-restore.md)."
fi

echo "==> Restarting api to pick up restored storage cleanly..."
docker compose restart api

echo "==> Restore complete. Verify with: node scripts/smoke-test.js verify <state-file>"
