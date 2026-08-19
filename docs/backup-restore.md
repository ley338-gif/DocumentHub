# Backup & Restore

**A successful backup job is worthless if restore doesn't work.** This
procedure has been run for real: seed real data end-to-end, back up,
destroy the environment (`docker compose down -v` — removes every volume),
fresh install, restore, verify every fact about the seeded data still
holds. See "Verified restore test" below for exactly what was run and what
passed.

## What gets backed up

**Both** PostgreSQL and document storage, together — neither alone is
sufficient to restore a working instance. The database has every
Publication's metadata and SHA-256; storage has the actual file bytes that
hash matches. Backing up only one gives you an instance that thinks it has
documents it can't serve, or files nothing points at.

`scripts/backup.sh` (Linux — canonical) / `scripts/backup.ps1` (Windows
wrapper, same logic) produce a timestamped directory containing:

- `database.dump` — `pg_dump --format=custom` of the whole database
- `storage.tar.gz` — a tar of the entire local storage volume (only when
  `STORAGE_DRIVER=local`; see "S3 storage" below)
- `manifest.json` — timestamp, app version, storage driver, and a SHA-256
  of each file for later integrity verification. **No secrets** — no
  `DATABASE_URL`, no `JWT_SECRET`, no S3 credentials, ever.

## Running a backup

```bash
docker compose up -d              # stack must be running
./scripts/backup.sh               # writes to ./backups/<UTC timestamp>/
```

```powershell
.\scripts\backup.ps1
```

### Consistency

This takes a live `pg_dump` (a single consistent transactional snapshot —
`pg_dump`'s normal guarantee) and a live `tar` of the storage volume,
moments apart — **not** one atomic transaction spanning both systems. For a
pilot deployment's write volume this is an honest, acceptable
approximation, not a claim of true cross-system atomicity. In the narrow
window between the two, a document uploaded but not yet published (still
`DRAFT`) could end up in the DB snapshot but not yet in the storage
snapshot, or vice versa — never a *published* Publication's file, since
publishing doesn't re-touch the file at all (it snapshots a `sha256`
already on disk). If you need a stronger guarantee, stop the `api` service
for the duration of the backup (a brief maintenance window) — see
[operations.md](operations.md)'s maintenance section.

### S3 storage

When `STORAGE_DRIVER=s3`, `backup.sh` skips the storage tarball (a
`storage.SKIPPED.txt` note is written instead) — the files live in your S3-
compatible provider, not on this host. Back them up via that provider's own
backup/replication/versioning (S3 cross-region replication, MinIO's own
backup tooling, etc.) — reimplementing generic S3 backup here would be far
more infrastructure than a pilot needs. The PostgreSQL half of the backup
still runs normally.

## Restoring

Restore always starts from a **fresh install** (migrated, empty schema),
never restores data over an already-populated database:

```bash
docker compose down -v            # destroy everything, including volumes
docker compose up -d              # fresh install: empty schema, migrated
./scripts/restore.sh ./backups/20260101T120000Z
```

```powershell
docker compose down -v
docker compose up -d
.\scripts\restore.ps1 -BackupDir .\backups\20260101T120000Z
```

`restore.sh`:

1. Verifies every backup file's SHA-256 against `manifest.json` before
   touching anything — a corrupted backup fails loudly here, not halfway
   through a restore.
2. `pg_restore --clean --if-exists -1` — drops existing (empty) objects,
   recreates them, loads the data, all in one transaction (a failure
   partway through leaves the database exactly as it was, not
   half-restored).
3. Extracts `storage.tar.gz` into the `api` container's storage volume
   (skipped, with a note, if the backup has no storage tarball — i.e. it
   was taken with `STORAGE_DRIVER=s3`).
4. Restarts `api` so it picks up the restored storage cleanly.

## Verified restore test

Run against this exact tooling, not a description of what it *should* do:

1. **Seeded real data** via `node scripts/smoke-test.js seed <state-file>`
   — platform admin login, create tenant, accept invitation as tenant
   admin, create product, create unit, upload a document revision, add an
   applicability rule, submit → approve, publish, resolve the public unit
   page, download via the public route, confirm the tenant audit trail —
   all over plain HTTP, the same paths a real user goes through, no
   Prisma/SQL shortcuts.
2. **Backed up**: `./scripts/backup.sh`.
3. **Destroyed the environment**: `docker compose down -v` — Postgres data
   and storage volumes both actually removed.
4. **Fresh install**: `docker compose up -d` — empty, migrated schema.
5. **Restored**: `./scripts/restore.sh <backup-dir>`.
6. **Verified**: `node scripts/smoke-test.js verify <state-file>` — re-logs
   in as both the platform admin and the tenant admin, and re-checks:
   - tenant still exists
   - the unit is still findable (by serial number)
   - the document revision still exists, with the **identical SHA-256**
   - the publication snapshot still exists and is `ACTIVE`
   - the tenant audit event for the publish is still there
   - the public unit page still resolves the publication
   - the public download still returns **byte-identical** content
   - historical resolution (`effectiveAt` = seed time) still finds the
     same publication

   All checks passed. Also independently confirmed: the platform audit
   trail (`PLATFORM_TENANT_CREATED` events) survived the same
   destroy/restore cycle.

Run this yourself before trusting any deployment: `scripts/smoke-test.js`
is the same tool, not a one-off script thrown away after this write-up.

## Retention (operator guidance, not a built platform)

Document Hub does not run scheduled backups or manage retention itself —
that's `cron`/a scheduled task calling `scripts/backup.sh`, plus your own
retention policy. A reasonable starting point for a single-tenant-per-host
pilot: daily backups, keep the last 7–14 daily, keep 4 weekly beyond that.
Adjust for your actual data volume and recovery-point requirements — this
is a suggestion, not a requirement Document Hub enforces.

## Encryption & access control

Backups contain the same sensitive data the live system does (customer
names, document contents, user emails). They are plain files on whatever
filesystem `backups/` lives on — encrypt and access-control that location
at the storage/filesystem level (disk encryption, restrictive file
permissions, a private/encrypted bucket if you ship backups off-host).
Document Hub does not encrypt backups itself; there is no built-in KMS.

## Data retention (separate concern from backup retention)

Suspending or closing a tenant never deletes anything — audit trails and
publications remain historically retained indefinitely (see
[security.md](security.md)'s tenant-lifecycle invariants). There is no
automatic deletion job. Backup retention (how long you keep *backup files*)
is entirely separate from this — pruning old backups never touches live
data.
