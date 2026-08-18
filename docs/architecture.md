# Architecture

## Stack

- NestJS 10 (Express platform) + TypeScript
- PostgreSQL via Prisma 5
- JWT auth (passport-jwt), bcrypt password hashing
- Pluggable object storage: local filesystem, or any S3-compatible endpoint
  (`STORAGE_DRIVER=s3`). Document Hub integrates only against the generic S3
  API (`@aws-sdk/client-s3`) — it has no dependency on any specific S3
  provider. `docker-compose.yml` runs MinIO purely as convenient local
  development infrastructure (so `docker compose up` works without an AWS
  account); MinIO's binary is never embedded in, bundled with, or modified
  by Document Hub, and production/self-hosted deployments are free to point
  `STORAGE_S3_*` at AWS S3, another S3-compatible provider, or their own
  MinIO instance.

## Module layout (`apps/api/src`)

| Module | Responsibility |
|---|---|
| `prisma` | Global `PrismaService`, injected everywhere. |
| `auth` | Registration, login, JWT issuance, `GET /auth/me`. |
| `organizations` | Organization CRUD, membership invite/list/role-change. |
| `audit` | `AuditService.record()` used by every mutating module, plus a read API. |
| `products` | ProductFamily / Product / ProductVariant / Batch / Unit CRUD. |
| `storage` | `StorageService` interface, local + S3 implementations, selected by `STORAGE_DRIVER`. |
| `documents` | Document + DocumentRevision (upload, state machine, download). |
| `applicability` | Applicability rule CRUD + the pure specificity/matching functions. |
| `publications` | Publish transaction, revoke, and the read-only resolver used everywhere resolution is needed. |

## Request pipeline

Every organization-scoped controller stacks three guards, applied consistently:

1. `JwtAuthGuard` — resolves `req.user` from the Bearer token.
2. `TenantGuard` — reads `X-Organization-Id` (or `:organizationId` route param),
   looks up the caller's `OrganizationMembership`, and attaches
   `req.tenant = {organizationId, membershipId, role}`. This is the single
   enforcement point for tenant isolation — no query anywhere trusts a
   body-supplied `organizationId`; every service method takes
   `organizationId` from `req.tenant`, not from the request body.
3. `RolesGuard` — reads `@Roles(...)` metadata and compares against
   `req.tenant.role` using the hierarchy VIEWER < EDITOR < PUBLISHER <
   ADMINISTRATOR (a higher role satisfies a lower requirement). No
   `@Roles()` decorator means "any authenticated member of the tenant may
   call this".

All three guards are applied per-controller (`@UseGuards(JwtAuthGuard,
TenantGuard, RolesGuard)`) rather than globally, because `/auth/register`
and `/auth/login` must be reachable without a token or tenant context.

## Error handling

`AppError` (typed, with a fixed set of codes — see
`src/common/errors/app-error.ts`) is the only error type services should
throw for expected failure modes. `AllExceptionsFilter` maps it to a stable
`{ error: { code, message, details } }` JSON body with the right HTTP
status. Anything else becomes a generic 500 — the intent is that a raw
Postgres unique-constraint violation, for example, is always caught in the
service layer and re-thrown as `AppError("VALIDATION_ERROR", ...)`, never
leaked to the client.

## Storage

`StorageService` is a three-method interface (`put`/`get`/`exists`) behind
a factory provider selected by `STORAGE_DRIVER`. Storage keys are always
generated server-side
(`org/{organizationId}/documents/{documentId}/{revisionId}/{sanitizedFilename}`)
— never derived directly from unsanitized user input. The local
implementation additionally resolves every key against its root and refuses
anything containing `..` or resolving outside the root, so a malicious key
can never escape the storage directory even if some future caller forgot to
sanitize it upstream.

## Applicability and publication resolution

See `docs/applicability-resolution.md` and `docs/publication-lifecycle.md`
for the two most important pieces of business logic in this system.
