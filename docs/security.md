# Security

## HTTPS

Required in production, via the reverse proxy / load balancer / hosting
provider in front of Document Hub — never a custom Node TLS implementation.
`docker-compose.production.yml` binds `api`/`web` to `127.0.0.1` only for
exactly this reason: they're meant to sit behind something that terminates
TLS. HTTP is fine for local dev (`docker-compose.yml`'s defaults).
`validate-production-config.ts` fails fast if `NODE_ENV=production` and
`PUBLIC_BASE_URL` isn't `https://`.

## Production config validation (fail-fast)

`apps/api/src/common/validate-production-config.ts` runs only when
`NODE_ENV=production`, before the app accepts any traffic. It refuses to
start (`process.exit(1)`, with a clear list of what's wrong) if:

- `JWT_SECRET` is missing, a known placeholder (`change-me-in-production`,
  `dev-secret-change-me`, etc.), or shorter than 32 characters
- `DATABASE_URL` is missing
- `PUBLIC_BASE_URL` is missing, not a valid URL, points at `localhost`/
  `127.0.0.1`, or isn't `https://`
- `STORAGE_DRIVER=s3` but any of `STORAGE_S3_ENDPOINT`/`_BUCKET`/
  `_ACCESS_KEY`/`_SECRET_KEY` is unset, or the driver value is neither
  `local` nor `s3`

No silent unsafe fallback exists for any of these — a misconfigured
production boot crashes loudly instead of starting with a weak secret or a
QR-code-breaking `PUBLIC_BASE_URL`.

## CORS

Restrictive by default (`apps/api/src/common/cors-options.ts`): the
allowed-origin list is built from `PUBLIC_BASE_URL`'s own origin plus an
optional `CORS_ALLOWED_ORIGINS` (comma-separated), falling back to
`http://localhost:5173` only when neither is configured (i.e. bare local
dev). No wildcard (`*`) for the authenticated internal API. The public
`/p`/`/u` routes don't need CORS at all in the browser-navigation case;
their JSON is fetched by the SPA from its own already-allowed origin.

## Security headers

`apps/api/src/common/security-headers.middleware.ts` (API) and
`apps/web/nginx.conf` (Web) both set: `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`, a `Content-Security-Policy`, and
`Strict-Transport-Security` **only when the request is actually HTTPS**
(`req.secure`, which respects `TRUST_PROXY` — see below) — never sent over
plain HTTP, where it would be meaningless and potentially confusing.

## Reverse proxy / `TRUST_PROXY`

`TRUST_PROXY` (env var, default `0`) is the number of reverse-proxy hops in
front of the API to trust for `X-Forwarded-*` headers — client IP,
protocol. `0` means trust none (correct for local dev and any deployment
with nothing in front). Only set it to `1` once you actually put one
reverse proxy in front (`docker-compose.production.yml`'s intended use).
This is never blind — an unset/`0` `TRUST_PROXY` means `req.ip` and
`req.secure` reflect the raw socket, not a header any client could forge.

## Rate limiting

Three isolated buckets, each via `@nestjs/throttler`, registered **once**
in `apps/api/src/common/rate-limit.module.ts` (see that file's comment for
why: `ThrottlerModule` is internally `@Global()`, so registering it
separately in multiple feature modules causes them to silently collide —
learned the hard way during this hardening pass, see git history):

| Bucket | Applies to | Default limit |
|---|---|---|
| `auth` | `/api/auth/login`, `/api/auth/register`, `/api/invitations/:token/accept` | 30/min per IP (`AUTH_THROTTLE_LIMIT`) |
| `default` | `/p/*`, `/u/*` (all public routes) | 30/min per IP (`PUBLIC_THROTTLE_LIMIT`) |

Every named throttler applies to every guarded route unless explicitly
skipped (`@SkipThrottle`) — each controller opts out of the bucket that
isn't its own, so `auth` and `default` stay genuinely isolated rather than
sharing one budget.

No CAPTCHA, no complex account-lockout system — a lockout tight enough to
stop credential stuffing is also tight enough to lock out a legitimate user
who mistypes a password a few times from a shared office IP. Login also
returns a generic error message on failure (no "user not found" vs. "wrong
password" distinction) to avoid user enumeration.

## Authentication

- JWT, HS256, `JWT_SECRET` validated for strength in production (above).
  `JWT_EXPIRES_IN` defaults to 8h.
- `JwtStrategy.validate()` re-fetches the `User` row from the database on
  **every** request and rejects if `status !== "ACTIVE"` — a suspended
  user's already-issued token stops working immediately, not just on their
  next login.
- Tenant status (`TRIAL`/`ACTIVE`/`SUSPENDED`/`CLOSED`) is enforced
  per-request by `TenantGuard`: `CLOSED` blocks everything, `SUSPENDED`
  blocks writes only. Neither ever hides a tenant's **already-published**
  public documentation — see "Public access" below.
- Logout is client-side token discard (there is no server-side session to
  invalidate for a stateless JWT) — a suspended/disabled user is still cut
  off immediately via the live status check above, which is the property
  that actually matters.

### Token storage: a conscious decision, not an oversight

The access token lives in `localStorage`
(`apps/web/src/lib/session-storage.ts`), not an `HttpOnly` cookie. This was
explicitly reconsidered during this hardening pass and kept, for reasons
specific to this architecture:

- API and Web are **deliberately separate origins** (see
  [deployment.md](deployment.md)'s architecture section) — an `HttpOnly`
  cookie would have to be `SameSite=None; Secure` to be sent cross-origin,
  which requires `credentials: "include"` on every fetch, CSRF protection
  the API doesn't have today, HTTPS in every environment including local
  dev, and is subject to browsers' evolving (and inconsistent)
  cross-site-cookie restrictions. That is a real auth-flow rewrite, not the
  "low-effort" swap the alternative would need to be to be worth doing now.
- In exchange, `localStorage` is hardened against the actual risk it
  carries (XSS-driven token theft):
  - No `dangerouslySetInnerHTML` anywhere in the frontend — grepped, zero
    occurrences.
  - A restrictive CSP (`script-src 'self'`, `object-src 'none'`,
    `frame-ancestors 'none'` — see `apps/web/nginx.conf`) blocks inline
    scripts and third-party script injection, the two most common paths to
    token exfiltration via XSS.
  - React's default JSX escaping means untrusted content (document names,
    user-supplied strings) is never rendered as raw HTML.

If a future phase moves Web and API onto genuinely the same origin (e.g.
via a same-origin `/api/*` reverse-proxy split that doesn't collide with
`/p`/`/u` — see deployment.md), revisit this: same-origin cookies stop
needing `SameSite=None`/CSRF-token plumbing and become the clearly better
default.

## Invitations

Re-reviewed this pass (Phase B's original design, unchanged):

- Tokens are stored **hashed only** (`tokenHash`) — the raw token exists
  only in the HTTP response at creation time and whatever channel relays it
  to the invitee (email, in a later phase; today the platform-tenant-create
  response returns it directly for the operator to relay).
- One-time use: accepting an invitation atomically claims it
  (`updateMany({where: {status: "PENDING"}, data: {status: "ACCEPTED"}})`
  inside the transaction) before doing anything else — two concurrent
  accept requests for the same token can't both succeed; the loser gets a
  clean "no longer available" error, not a race-condition side effect.
- Expiry and revoke are enforced server-side; an expired or revoked
  invitation is rejected before any account/membership work happens.
- Accepting for an email that already has an account requires being
  authenticated as *that* account (`INVITATION_LOGIN_REQUIRED` /
  `FORBIDDEN` otherwise) — an invitation can't be used to silently take
  over an unrelated existing account.
- Never logged: the raw token doesn't appear in the structured request log
  (only method/route/status/duration/ids are logged — see "Logging"
  below), and isn't stored anywhere but the recipient's copy.

## Upload security

`apps/api/src/documents/revisions.service.ts` + `revisions.controller.ts`:

- MIME allowlist: `application/pdf` only.
- Size limit enforced **twice**, deliberately: Multer's own
  `limits.fileSize` (100MB) rejects an oversized upload while it's still
  streaming in — added this pass, previously the service-level check ran
  only *after* Multer had already buffered the entire file into memory,
  which is itself a resource-exhaustion risk for a large upload that was
  always going to be rejected anyway. The service-level check remains as
  defense in depth.
- Filenames are sanitized (`sanitizeFilename` — strips to
  `[a-zA-Z0-9._-]`) before being used in the storage key or
  `Content-Disposition` header — no path traversal, no header injection.
- SHA-256 computed server-side over the actual received buffer — a
  client-supplied hash is never trusted.
- Storage keys are namespaced by organization
  (`org/<organizationId>/documents/...`) — see `local-filesystem-storage.service.ts`'s
  path-traversal protection (resolves and verifies every key stays under
  the configured root before any filesystem operation).
- No antivirus scanning — not justified for a PDF-only, size-capped,
  tenant-isolated upload surface at pilot scale; revisit if the accepted
  MIME types ever expand.

## Download security (public routes)

Every public download **re-resolves the publication from the database on
every request** — nothing is cached in a way that could serve stale
authorization:

- Revoked → immediately unavailable (the resolver's query filters on
  `revokedAt IS NULL`).
- Suspended tenant → **existing published** documentation stays available
  (this was a real bug fixed in Phase B: the resolver previously checked
  `organization.status !== "SUSPENDED"` and hid everything — removed,
  because a suspended tenant's customers must not lose access to
  documentation for equipment already in the field).
- Closed tenant → same policy, same reasoning — existing public
  documentation is never pulled by a lifecycle change, only by an explicit
  revoke of that specific Publication.

## Public access — the four states, verified independently

These four states are easy to blur together and must not be:

| Tenant/publication state | Public access |
|---|---|
| ACTIVE tenant, active publication | Works |
| SUSPENDED tenant, active publication | Still works (existing docs never disappear) |
| CLOSED tenant, active publication | Still works (same reasoning) |
| REVOKED publication (any tenant state) | No longer works — this is the only thing that actually removes public access |

## Error handling

`AllExceptionsFilter` (`apps/api/src/common/errors/all-exceptions.filter.ts`)
never lets a stack trace, SQL error, Prisma error detail, storage key, or
filesystem path reach the client. An unhandled exception logs the real
error (message + stack) to the structured log only, and returns a generic
`{"error":{"code":"INTERNAL_ERROR","message":"Internal server error","requestId":"..."}}`
to the caller — the `requestId` is safe to return (just a correlation
string) and is how a user reports a specific failure to support without
exposing anything about *why* it failed.

## Logging

`apps/api/src/common/request-logging.middleware.ts` logs one JSON line per
completed request: `timestamp`, `level`, `requestId`, `method`, `route`,
`statusCode`, `durationMs`, and `userId`/`organizationId` when the request
was authenticated. **Never** the request body, response body, headers, or
query string — there is no code path in the logging layer that reads any
of those, so there is no way for a password, JWT, invitation token, S3
credential, or file content to end up in a log line by accident.

A per-request ID (`apps/api/src/common/request-context.middleware.ts`, via
Node's `AsyncLocalStorage`) is generated once per request and threads
through to both the structured request log and the tenant/platform audit
trails (`AuditEvent.requestId` / `PlatformAuditEvent.requestId`) — so a
support investigation can go from "user reports requestId X" to the exact
log line **and** the exact audit rows that request produced, without
grepping timestamps. `ipAddress` (from `req.ip`, which respects
`TRUST_PROXY` — never blindly read from headers) is captured the same way.

Audit trails (`AuditEvent` for tenant actions, `PlatformAuditEvent` for
platform-operator actions) are a **separate, append-only concern** from
request logs — logs are operational/debugging signal with no retention
guarantee; audit rows are the permanent record of who-did-what, never
deleted, never overwritten.

## Health & graceful shutdown

- `GET /health/live` — process is up. Never depends on the database or
  storage, so an orchestrator never restart-loops a healthy-but-briefly-
  disconnected container.
- `GET /health/ready` — database + storage both reachable; returns HTTP
  `503` (not `200`) when not ready.
- `app.enableShutdownHooks()` is called in `main.ts` — on `SIGTERM`,
  in-flight requests finish and `PrismaService.$disconnect()` runs cleanly
  before the process exits, instead of connections being cut mid-request.

## Dependency & license audit

`npm audit --omit=dev` (2026-08-19, both workspaces):

- **`apps/web`: 0 vulnerabilities.**
- **`apps/api`: 8 findings, all moderate/high, all denial-of-service class
  (resource exhaustion / infinite loop on malformed input), none of them
  RCE or data exposure.** All 8 trace back to `@nestjs/platform-express`
  10.x's pinned `multer`/`express`/`body-parser`/`qs` versions; fixing them
  requires a NestJS **major** version bump (10 → 11/12), which is a
  breaking change explicitly out of scope for this hardening pass (no
  blind major upgrades — see the hardening spec's own instruction).
  Mitigating factors already in place: the upload endpoint now has a hard
  Multer `fileSize` limit (this pass — see "Upload security"), and every
  public/auth-adjacent route is rate-limited (see "Rate limiting"), both of
  which blunt the practical impact of a DoS-class dependency issue.
  **Recommendation: schedule the NestJS 11/12 upgrade as a dedicated,
  regression-tested piece of post-RC work, not squeezed into this release.**

License overview (permissive-only in the actual runtime dependency graph —
checked every top-level runtime dependency's own `package.json` `license`
field, not just guessed):

| Component | License |
|---|---|
| `@nestjs/*` (common, core, jwt, passport, platform-express, throttler) | MIT |
| `@aws-sdk/client-s3` | Apache-2.0 |
| `@prisma/client` | Apache-2.0 |
| `bcryptjs`, `class-transformer`, `class-validator`, `multer`, `nanoid`, `passport`, `passport-jwt`, `qrcode` | MIT |
| `reflect-metadata`, `rxjs` | Apache-2.0 |
| `react`, `react-dom`, `react-router-dom`, `zustand` | MIT |
| Docker base images: `node:20-alpine`, `nginx:1.27-alpine`, `postgres:16-alpine` | Permissive (Node/npm's own license, BSD-2-Clause-style nginx license, PostgreSQL License) |

**MinIO is the one AGPL-licensed component anywhere near this project —
and it is not a runtime dependency of Document Hub at all.** It's an
optional Docker Compose service (`profiles: ["s3"]`), never started by
default, used only as convenient local/dev S3-compatible infrastructure.
Document Hub's own code depends on a generic storage abstraction
(`StorageService`), never on MinIO specifically — a self-hosted or SaaS
deployment can use AWS S3, any other S3-compatible provider, or local
filesystem storage instead, with zero code changes. If MinIO is removed
from the repo entirely, nothing about the product's own functionality
changes.

## Container security

- Both runtime images run as a non-root user (`documenthub`, created via
  `addgroup`/`adduser` — see the Dockerfiles).
- Multi-stage builds: the runtime image contains only compiled output +
  production `node_modules` — no source, no tests, no dev dependencies, no
  local `.env` files (`.dockerignore` excludes them explicitly).
- No secrets baked into any image — all secrets are runtime environment
  variables, supplied via `.env`/Compose, never `ARG`/`ENV` in a
  Dockerfile (the one exception, `VITE_API_BASE_URL`, is a public API base
  URL, never a secret — see deployment.md).
- No dev server in either production image — Web is nginx serving a static
  build, not the Vite dev server; API runs the compiled `dist/`, not
  `ts-node`/`nest start --watch`.

## Frontend environment variables

Exactly one `VITE_*` variable is used anywhere in the frontend:
`VITE_API_BASE_URL` (the API's public origin — not a secret; grepped, no
other `VITE_*` reads exist). Vite embeds `VITE_*` values into the JS bundle
at **build** time — never put a secret in one, since anything embedded here
ships to every browser that loads the app.
