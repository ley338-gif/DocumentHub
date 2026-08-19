# Upgrades

## Procedure

```bash
./scripts/backup.sh                       # 1. always back up first
git fetch && git checkout v0.1.1          # 2. pull the new version (example tag)
docker compose build                      # 3. build the new images
docker compose run --rm migrate           # 4. migrate — see note below
docker compose up -d                      # 5. restart with the new images
docker compose ps                         # 6. confirm everything is healthy
node scripts/smoke-test.js seed /tmp/upgrade-check.json   # 7. smoke test
```

Step 4 is written as `docker compose run --rm migrate` (not `up -d
migrate`) because you may want to watch its output interactively during an
upgrade, unlike the fully automated fresh-install path where `up -d`
already sequences it correctly via `depends_on: condition:
service_completed_successfully`. Either form runs the same
`prisma migrate deploy`.

Step 7 doesn't have to use the smoke-test tool specifically — any check
that logs in, exercises a core flow, and confirms nothing broke is the
point. The smoke test is there because it already does exactly that.

## Version visibility

The running version is visible in three places, so "what's actually
deployed" is never a guessing game:

- The System page (Platform Admin UI)
- `GET /health/live` and `GET /health/ready` (`version` field)
- The API's startup log line (`Document Hub API v<version> listening on
  port <port>`)

No git-commit-hash exposure beyond what's already in the version string —
deliberately, to avoid leaking internal repository detail to anything that
can reach `/health/live` (which is intentionally unauthenticated).

## Rollback

**Prisma migrations are not automatically reversible.** There is no
`prisma migrate down` equivalent wired up, and writing one generically for
every migration this project will ever have is out of scope. The real MVP
rollback strategy, and the only one to actually rely on, is:

1. Restore the previous application version's images
   (`git checkout v<previous>; docker compose build`).
2. Restore the pre-upgrade database backup (see
   [backup-restore.md](backup-restore.md)) — this is *why* step 1 of the
   upgrade procedure is "back up first," not optional.
3. Restore the pre-upgrade storage backup if the upgrade touched anything
   storage-related.
4. `docker compose up -d`, confirm healthy, smoke test.

This is a real, if blunt, rollback path — restore to the exact
pre-upgrade state — not a claim that any specific migration can be
"undone" in place. Never attempt to hand-roll a partial rollback by editing
the database directly to match an older schema; restore instead.

## Between RC and GA

`v0.1.0-rc.1` is explicitly **not** automatically GA. The expected path is:
release candidate → real pilot deployment → monitoring + feedback →
bugfixes → possibly `rc.2` → only then `v0.1.0`. Don't skip the pilot
step by treating an RC tag as a production-ready release on its own.
