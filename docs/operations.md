# Operations

Day-2 concerns: what to watch, how to troubleshoot, what a maintenance
window looks like, and what was checked for pilot-scale readiness. For
initial deployment see [deployment.md](deployment.md); for backups see
[backup-restore.md](backup-restore.md); for upgrades see
[upgrades.md](upgrades.md).

## What to monitor

No Prometheus/Grafana mandate for `v0.1.0-rc.1` — these are the signals a
pilot operator should actually watch, and how to get at them with what's
already here:

| Signal | How |
|---|---|
| API/DB/storage availability | `GET /health/ready` — machine-readable, `200`/`503` |
| Process liveness | `GET /health/live`, or `docker compose ps` |
| Disk usage | Host-level (`df`) — both the Postgres volume and (if `STORAGE_DRIVER=local`) the storage volume |
| HTTP 5xx rate | Structured request logs (`statusCode >= 500`, logged at `level: "error"`) |
| Failed logins / uploads / publications | Structured request logs (non-2xx on `/api/auth/login`, revision upload, publish endpoints) + the tenant audit trail for anything that got far enough to be a real domain action |
| Backup success | Exit code of `scripts/backup.sh` in whatever scheduler runs it — script exits non-zero on any failure |

`docker compose ps` after any `up`/restart should show every service as
`healthy` — that alone catches most "something's wrong" situations before
a user reports them.

## Structured logs

One JSON line per request (see [security.md](security.md#logging) for the
exact shape and the "never log secrets" guarantee). Useful `grep`/`jq`
patterns:

```bash
docker compose logs api | grep '"statusCode":5'          # server errors
docker compose logs api | grep '"requestId":"<id>"'      # one request's full log line
docker compose logs api | jq -r 'select(.durationMs > 1000)'   # slow requests
```

## Query performance sanity check

Reviewed during this hardening pass — Units search, Publications list,
Audit list, Platform tenants/users list, and the public resolver all
already paginate via `skip`/`take` (no unbounded `findMany` anywhere in
these hot paths), and no N+1 pattern was found (batch lookups like
`publishedByName`/`revokedByName` resolution use one `IN (...)` query per
page, never one query per row). No changes were needed.

Units search already supports lookup by exact `serialNumber` (`GET
/api/units?serialNumber=...`) in addition to `productId` filtering — this
is sufficient for the admin/support flow at pilot scale; broader
fuzzy/partial search wasn't added, since the spec for this pass explicitly
scopes "only add if the current flow would otherwise be practically
unusable at scale," and exact-match lookup by serial number is the
common case (a support call almost always starts from a specific unit's
serial number, read off the physical product or its label).

## Database connections

Prisma manages its own connection pool (sized from `DATABASE_URL`, default
`num_cpus * 2 + 1`) — no external pooler (PgBouncer etc.) is configured or
needed at pilot scale. If a future deployment needs many more concurrent
API instances than one, revisit this; don't add pooling infrastructure
preemptively.

## Resource guidance (pilot scale, not hard limits)

No Compose resource limits are set — this is guidance for sizing a host,
not enforcement:

| Component | CPU | RAM | Disk |
|---|---|---|---|
| PostgreSQL | 1 vCPU | 512MB–1GB | Grows with tenant count × document/unit volume — start with 10GB, monitor |
| API | 1 vCPU | 256–512MB | Negligible (stateless) |
| Web (nginx) | 0.5 vCPU | 64–128MB | Negligible (static assets) |
| Local storage volume (if used) | — | — | Sum of all uploaded document revisions across all tenants |

A single small VM (2 vCPU / 4GB RAM / 20GB disk) comfortably runs a pilot
with a handful of tenants.

## Maintenance window

For anything that genuinely needs the app briefly unavailable (a stronger-
than-usual-consistency backup, a manual data fix):

```bash
./scripts/backup.sh                 # back up first, always
docker compose stop api web         # stop serving traffic (postgres stays up)
# ... do the maintenance ...
docker compose start api web
curl http://<api-origin>/health/ready   # confirm healthy before considering it done
```

No built-in "maintenance mode" page/feature — for a pilot-scale, single-
tenant-per-incident window, a brief connection-refused is an acceptable and
honestly-documented tradeoff rather than building a maintenance-mode
feature that isn't needed yet.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up -d --build` fails at the `api` build step | Missing `apps/web/package.json` copy in a Dockerfile stage, or a genuinely broken `npm ci` (lockfile out of sync) | `docker compose build --no-cache api` for a clean error; check the actual npm error above the failure |
| `migrate` service exits non-zero | Bad `DATABASE_URL`, Postgres not actually healthy yet, or a genuinely broken migration | `docker compose logs migrate`; confirm `docker compose ps postgres` shows healthy first |
| `api` never becomes healthy | `/health/ready` returning 503 — check `docker compose logs api` for which of database/storage is failing, and `docker compose exec api curl -s http://localhost:3000/health/ready` | Fix the underlying DB/storage config; the healthcheck is telling the truth |
| API refuses to start with a config error list | `NODE_ENV=production` + invalid config (see [security.md](security.md)) | Fix exactly what the printed list says — it's deliberately specific |
| QR code / public link 404s or points at the wrong host | `PUBLIC_BASE_URL` wrong at the time the Publication was created, or `web` not reachable at that origin | `PUBLIC_BASE_URL` is baked into the QR at generation time — verify it before generating real customer-facing QR codes; see deployment.md |
| Web loads but every API call fails with a CORS error | `PUBLIC_BASE_URL`/`CORS_ALLOWED_ORIGINS` don't include the origin the browser is actually loading Web from | Set `CORS_ALLOWED_ORIGINS` to include that exact origin |
| Login/register suddenly returns 429 | Rate limit hit (30/min per IP, `auth` bucket) — normal after e.g. running an automated test suite against a shared IP | Wait a minute, or raise `AUTH_THROTTLE_LIMIT` for a non-production environment that legitimately needs higher burst traffic (e.g. CI) |
| A revoked publication is still downloadable | Should never happen — the resolver re-checks on every request. If observed, this is a P0 bug; check `Publication.revokedAt` directly and file it as such |
| `docker compose down -v` was run by mistake | Every named volume (Postgres data, storage) is gone | Restore from the most recent backup — see [backup-restore.md](backup-restore.md). There is no undo for `-v`. |
| Backup succeeds but restore fails | See [backup-restore.md](backup-restore.md) — restore is the part that actually matters; a passing backup with an untested restore is not a real backup |
| Bootstrap script says a platform admin already exists | Idempotent by design — check with `docker compose exec api node -e "..."` or just log in with the email you expect | Not a bug; use a different email for a second platform admin if genuinely needed |

## Regression checklist (re-run after any change touching auth/tenancy/publications)

- Normal user blocked from `/platform`
- Tenant admin blocked from `/platform`
- Suspended user's existing JWT rejected on the next request
- Suspended/closed tenant blocked from writes
- Public docs remain accessible for suspended/closed tenants
- Revoked publication immediately unavailable publicly
- Cross-tenant IDs rejected (tenant A can never reach tenant B's data)
- Invitation reuse/expiry rejected

All of the above are covered by the automated e2e suite
(`npm run test:e2e` in `apps/api`) — this list exists so a manual spot-check
covers the same ground when reviewing a change that didn't touch the tests
themselves.
