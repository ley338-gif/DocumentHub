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
node -e '
const fs = require("fs");
const crypto = require("crypto");
const dir = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
for (const [key, entry] of Object.entries(manifest.files)) {
  if (entry.sha256 === "n/a") continue;
  const path = `${dir}/${entry.name}`;
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
  if (actual !== entry.sha256) {
    console.error(`SHA-256 mismatch for ${key} (${entry.name}): expected ${entry.sha256}, got ${actual}`);
    process.exit(1);
  }
  console.log(`  OK  ${entry.name}`);
}
' "$BACKUP_DIR"

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
