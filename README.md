# Document Hub

Document Hub is a multi-tenant SaaS backend for controlled technical-document
publication: manufacturers manage product structures (families, products,
variants, batches, serialized units), attach and version technical
documents (manuals, safety notices, ...), define which document revisions
apply to which products/units via applicability rules, and publish them
through an auditable, conflict-checked workflow. End customers resolve
"what documentation applies to *this* specific unit, right now or as of
some point in the past" against immutable publication snapshots — via a
public QR-code flow (`/p/:stableId`, `/u/:stableId`).

See `docs/architecture.md`, `docs/domain-model.md`,
`docs/applicability-resolution.md`, and `docs/publication-lifecycle.md` for
the design in depth.

## Deploying Document Hub

**Want to run Document Hub, not develop it?** Start at
[docs/deployment.md](docs/deployment.md) — `docker compose up -d --build`
from a `.env` you copy from `.env.example`, no manual npm/Prisma/SQL steps.
Then:

- [docs/platform-admin.md](docs/platform-admin.md) — bootstrap the first
  platform admin, create your first tenant (quickstart, both roles)
- [docs/operations.md](docs/operations.md) — what to monitor, troubleshooting
- [docs/backup-restore.md](docs/backup-restore.md) — back up **and actually
  restore** before you have real data you can't afford to lose
- [docs/security.md](docs/security.md) — everything hardening-related, in
  one place
- [docs/upgrades.md](docs/upgrades.md) — upgrade and rollback procedure

## Repository layout

```
apps/
  api/    NestJS + Prisma + PostgreSQL backend
  web/    React + Vite frontend (see apps/web/README.md)
docs/     architecture, domain design, and deployment/operations notes
scripts/  backup.sh/.ps1, restore.sh/.ps1, smoke-test.js — see docs/backup-restore.md
```

## Local development

Prerequisites: Docker, Node.js 20+.

```bash
# 1. Start Postgres (local filesystem storage needs no extra service; add
#    `--profile s3 minio` too if you want to develop against S3-compatible
#    storage instead — see docs/deployment.md)
docker compose up -d postgres

# 2. Install dependencies (installs both apps/api and apps/web)
npm install

# 3. Apply the database schema
npx prisma migrate dev --schema apps/api/prisma/schema.prisma

# (or, equivalently, from apps/api:)
cd apps/api && npx prisma migrate dev

# 4. (optional) seed demo data
npm run prisma:seed --workspace apps/api

# 5. Run the API in watch mode
npm run dev:api

# 6. Run the frontend dev server (in a separate terminal)
npm run dev:web
```

The API listens on `http://localhost:3000` by default (`/health` for a
liveness check, everything else under `/api` except the public `/p` and
`/u` routes — see `apps/api/src/common/global-prefix.ts`).

The frontend listens on `http://localhost:5173` by default and talks to the
API via `VITE_API_BASE_URL` (see `apps/web/README.md`). Copy
`apps/web/.env.example` to `apps/web/.env.local` to override it.

Copy `apps/api/.env.example` to `apps/api/.env` and adjust as needed —
`DATABASE_URL`, `JWT_SECRET`, and the `STORAGE_*` variables (local
filesystem storage by default; set `STORAGE_DRIVER=s3` to use MinIO/S3).

## Testing

```bash
cd apps/api
npm run test          # unit tests (pure functions, no DB required)
npm run test:e2e      # acceptance test against a real Postgres test database,
                       # configured via apps/api/.env.test (uses a separate
                       # document_hub_test database, never the dev DB)
```

```bash
cd apps/web
npm run typecheck     # tsc -b --noEmit
npm run build         # tsc -b && vite build
npm run lint          # eslint .
```
