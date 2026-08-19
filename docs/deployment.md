# Deployment

Document Hub ships as two container images (API, Web) plus PostgreSQL, run
via Docker Compose. This is the only supported deployment path for
`v0.1.0-rc.1` — no Kubernetes manifests, no Helm chart, no managed-platform
buildpacks. Keep it that simple until an actual pilot needs otherwise.

## Architecture

```
Browser ──▶ Web (nginx, static SPA build)
Browser ──▶ API (NestJS) ──▶ PostgreSQL
                          └─▶ Storage (local volume, or S3-compatible)
```

Web and API are deliberately **separate origins by default**, not one
reverse-proxied origin with `/api/*` split off. The public `/p/:stableId`
and `/u/:stableId` paths are simultaneously (a) SPA client routes that must
render HTML on direct browser navigation, and (b) the exact unprefixed path
the SPA's own JS fetches JSON from — collapsing Web and API onto one origin
makes those two uses collide at the identical path, since a plain
`/api/*`-vs-everything-else split sends both of them to Web. Separate
origins with strict CORS (see [security.md](security.md)) avoids the
question entirely, at the cost of needing two `PUBLIC_BASE_URL`/
`VITE_API_BASE_URL` values instead of one.

### Optional: a single domain, with content negotiation

An operator who wants everything behind one domain (e.g. one existing
reverse proxy already fronting several apps) can do it, but `/api/*`-vs-
everything-else alone is **not** collision-free for `/p` and `/u` — this
was tried and caught during this project's own real-device QR validation.
The fix: the frontend's API client sends `Accept: application/json` on
every request (see `apps/web/src/lib/api-client.ts`); a real browser
navigation never does. Route on that, plus keep the download sub-paths
(which have no competing SPA route at all) unconditionally on the API:

```caddyfile
your-domain.example {
    @publicDownload path_regexp ^/(p|u)/[^/]+/publications/[^/]+/download$
    handle @publicDownload {
        reverse_proxy api:3000
    }

    @publicPageData {
        path_regexp ^/(p|u)/[^/]+$
        header Accept application/json
    }
    handle @publicPageData {
        reverse_proxy api:3000
    }

    handle /api/* {
        reverse_proxy api:3000
    }
    handle /health/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy web:80
    }
}
```

Set both `PUBLIC_BASE_URL` and `VITE_API_BASE_URL` to that one domain. This
is genuinely more fragile than the two-origin default (it depends on every
client sending `Accept` correctly, which only Document Hub's own frontend
is guaranteed to do) — use it deliberately, not as the default assumption,
and re-verify `/p`/`/u` actually return JSON to the SPA (not the SPA shell)
after any proxy config change: `curl -s -H "Accept: application/json" https://your-domain/u/<stableId>`
should return JSON, not `<!doctype html>`.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose`, not the standalone
  `docker-compose` v1 binary)
- A `.env` file in the repo root (copy `.env.example` and edit it)

Nothing else. Not Node.js, not `npm`, not the Prisma CLI, not a database
client — everything runs inside containers.

## Fresh install

```bash
cp .env.example .env
# edit .env: at minimum set a real JWT_SECRET
docker compose up -d --build
docker compose ps   # everything should show "healthy" within ~30s
```

This single command:

1. Builds the `api`, `web`, and `migrate` images (multi-stage — the
   runtime images contain no dev dependencies, no source, no tests, no
   `.env` files).
2. Starts PostgreSQL and waits for it to report healthy.
3. Runs `migrate` — a one-shot container that runs `prisma migrate deploy`
   (never `migrate dev`) and exits. `api` will not start until this exits
   `0`. This is the *only* place migrations run — never automatically as a
   side effect of API boot.
4. Starts `api`, waits for its healthcheck (`GET /health/live`).
5. Starts `web` (nginx serving the production Vite build).

No `npm install`, no manual `prisma migrate`, no SQL, no Prisma Studio.

## Bootstrap the first platform admin

There is no HTTP endpoint that creates a `PLATFORM_ADMIN` — by design, so
platform privilege can never be granted (or self-granted) over the network.
After a fresh install:

```bash
docker compose exec -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  -e BOOTSTRAP_ADMIN_PASSWORD='<a real password>' \
  -e BOOTSTRAP_ADMIN_NAME='Platform Operator' \
  api node dist/src/bootstrap-platform-admin.js
```

Idempotent — running it again with the same email does nothing if that
user already exists (it does not escalate an existing user or overwrite a
password). Password requirements match normal account passwords (see
[security.md](security.md)). See also
[platform-admin.md](platform-admin.md) for what to do next (login, create
the first tenant).

## Storage

Default: `STORAGE_DRIVER=local`, files on a persistent named Docker volume
(`api-storage`). No extra service required. Survives `docker compose
restart` and `down`/`up` — only `down -v` removes it.

For S3-compatible storage, set `STORAGE_DRIVER=s3` and the `STORAGE_S3_*`
variables in `.env`. For local testing against MinIO specifically:

```bash
docker compose --profile s3 up -d
```

MinIO is **never** started by the default `docker compose up -d --build` —
it sits behind an explicit `s3` Compose profile. This is deliberate: MinIO
is AGPL-licensed, and Document Hub must not be architecturally or
commercially dependent on it. It exists in this repo purely as convenient
local/dev S3-compatible infrastructure. A real deployment either uses
`STORAGE_DRIVER=local` or points `STORAGE_DRIVER=s3` at an actual provider
(AWS S3, Hetzner Object Storage, Backblaze B2, ...) — MinIO is never a
required product component. See [security.md](security.md) for the full
license rationale.

## Environment variables

See `.env.example` (local/dev) and `.env.production.example` (production
overlay) for every variable with inline documentation. The ones that most
affect a deployment's *behavior*, not just its config:

| Variable | Effect |
|---|---|
| `NODE_ENV` | `production` turns on fail-fast startup validation (strong `JWT_SECRET`, HTTPS+non-localhost `PUBLIC_BASE_URL`, complete storage config) — see [security.md](security.md). |
| `PUBLIC_BASE_URL` | The **frontend's** public origin. Encoded directly into every QR code. Never the API's own origin, never `localhost` in production. |
| `VITE_API_BASE_URL` | Baked into the web bundle at **build time** (Vite embeds `VITE_*` then, not at container start) — rebuild the `web` image if this changes. |
| `REGISTRATION_MODE` | `INVITE_ONLY` (default, required for any real tenant) or `SELF_SERVICE` (open self-registration — dev/demo only). |
| `TRUST_PROXY` | Reverse-proxy hop count to trust for `X-Forwarded-*` headers. `0` (default) = trust none. Only raise this once a real reverse proxy is actually in front — see [security.md](security.md). |

## Production overlay

The root `docker-compose.yml` is dev/pilot-focused (HTTP, `localhost`
origins work out of the box). For an actual deployment behind a real HTTPS
reverse proxy or load balancer:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

See that file's header comment for exactly what it changes (`NODE_ENV=production`,
127.0.0.1-only port binding). It is the same architecture, not a second one —
per the hardening spec's explicit instruction not to maintain two
deployment topologies.

## SPA routing

Every client route (`/login`, `/register`, `/invite/:token`, `/app/*`,
`/platform/*`, `/p/:stableId`, `/u/:stableId`) works on a direct browser
navigation or refresh — nginx's `try_files $uri $uri/ /index.html` fallback
(see `apps/web/nginx.conf`) serves `index.html` for any path that isn't a
real static asset, and the SPA's router takes it from there.

## Verifying a deployment

```bash
docker compose ps                          # all services "healthy"
curl http://<web-origin>/                  # 200
curl http://<api-origin>/health/ready      # {"status":"ok",...}
node scripts/smoke-test.js seed /tmp/state.json   # full product-flow smoke test
```

See [operations.md](operations.md) for day-2 operational concerns and
[backup-restore.md](backup-restore.md) before you have anything you can't
afford to lose.
