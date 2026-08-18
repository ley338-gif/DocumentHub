# Document Hub — Frontend (`apps/web`)

React + TypeScript + Vite frontend for Document Hub. Built so far: the
shared design system, the authenticated app shell with a bare login flow,
the public QR-scan pages, and the authenticated Products and Documents admin
screens (with the document revision lifecycle). The applicability rule
editor, publish wizard, CSV import UI, audit UI, and real dashboard KPIs are
deliberately not built yet — see "What's built" below.

## Running locally

Prerequisites: the backend (`apps/api`) running and reachable (see the root
`README.md` for how to start Postgres + the API).

```bash
# from the repo root
npm install
cp apps/web/.env.example apps/web/.env.local   # optional, defaults to http://localhost:3000
npm run dev:web
```

The dev server runs on `http://localhost:5173`. It talks to the API at the
URL in `VITE_API_BASE_URL` (env var, default `http://localhost:3000`) — no
API base URL is ever hardcoded inline; every request goes through
`src/lib/api-client.ts`.

Other scripts (run from `apps/web`, or via `npm run <script> --workspace apps/web`
from the root):

```bash
npm run build       # tsc -b && vite build — type-checks and produces dist/
npm run typecheck   # tsc -b --noEmit only
npm run lint         # eslint .
npm run preview      # serve the production build locally
```

## Route map

| Path | Auth | Purpose |
| --- | --- | --- |
| `/p/:stableId` | none | Public product page — mirrors the backend's `GET /p/:stableId` 1:1, no admin chrome. |
| `/u/:stableId` | none | Public unit page — mirrors `GET /u/:stableId`. |
| `/login` | none | Login screen. |
| `/app` | required | Authenticated app shell (sidebar + top bar). Redirects to `/login` if there's no valid session. |
| `/app` (index) | required | Dashboard — placeholder only, still deferred. |
| `/app/products` | required | Products list — server-paginated, `Table`/`Pagination`. |
| `/app/products/:id` | required | Product detail — tabs: Übersicht, Varianten, Einheiten, Dokumentation (read-only "currently applicable documents" via `GET /api/publications/resolve?productId=`), Öffentlicher Zugriff (stable ID, public URL, QR via authenticated blob fetch), Verlauf (placeholder, see below). |
| `/app/documents` | required | Documents list — server-paginated; Sprachen/Aktuelle Revision are derived client-side from each document's revisions (the API doesn't compute them). |
| `/app/documents/:id` | required | Document detail — tabs: Übersicht, Revisionen (state-machine actions gated by role + current status, real backend errors surfaced via `Toast`), Anwendbarkeit (read-only, per revision), Veröffentlichungen (read-only), Dateien (upload form), Verlauf (placeholder). |
| `/app/publications`, `/app/audit` | required | Sidebar nav stubs — no pages behind them yet (later phases: publish wizard, audit UI). |

**Audit history**: `GET /api/audit` only supports filtering by
`objectType`/`action`/`from`/`to`, not `objectId`, so there is no way to
fetch a true per-object history without fetching the whole org log and
filtering client-side. Rather than misrepresent that as a real per-object
audit trail, the "Verlauf" tab on both Product Detail and Document Detail is
an honest "not available yet" placeholder (`src/features/shared/HistoryTab.tsx`)
until the audit endpoint gains an `objectId` filter.

The public routes are intentionally at the app's root (`/p/...`, `/u/...`),
matching `PUBLIC_BASE_URL` in `apps/api/.env.example` — a QR code encodes
`{PUBLIC_BASE_URL}/p/{stableId}` and must land directly on this frontend's
route of the same shape.

## Design system (`src/design-system/`)

Tokens (`tokens.css`) are CSS custom properties derived from the reference
mockups in `images/*.png` — color, spacing, radii, typography scale,
shadows. Components are plain React + CSS Modules (one `.module.css` per
component), mobile-first:

`AppShell`, `Sidebar`, `PageHeader`, `Tabs`, `Table` (generic, column-driven,
no built-in fetching), `FilterBar`, `Badge` / `StatusBadge`, `Dialog`,
`Drawer`, `Pagination`, `Toast` (`ToastProvider` + `useToast()`), `Button`,
`Input`, `Select`, `Spinner`. All are exported from
`src/design-system/index.ts`.

## Application code layout

```
src/
  design-system/     shared UI components + tokens (see above)
  lib/
    api-client.ts     fetch wrapper: attaches Authorization/X-Organization-Id,
                       parses the backend's { error: { code, message, details } }
                       shape into a typed ApiError
    api-error.ts       ApiError class + per-code German user-facing messages
    api-types.ts        response shapes mirrored from the real API DTOs
    session-storage.ts   localStorage helpers for the JWT + current org id
    format.ts            formatFileSize, languageLabel
  features/
    auth/               auth-store.ts (Zustand), LoginPage, RequireAuth (route guard),
                        useCurrentRole (current org membership role)
    app-shell/           AppLayout — wires AppShell + Sidebar + org switcher for /app/*
    dashboard/            placeholder DashboardPage
    products/              ProductsListPage, ProductDetailPage + tabs/, api.ts,
                            ManageFamiliesDialog, ManageBatchesDialog, CreateProductDialog
    documents/              DocumentsListPage, DocumentDetailPage + tabs/, api.ts,
                            CreateDocumentDialog
    shared/                 HistoryTab (the audit "not available yet" placeholder)
    public/               public QR-scan pages: PublicProductPage, PublicUnitPage,
                           PublicationList, LanguageSelector, usePublicResource (loading/
                           not-found/error state machine), useLanguageFilter
```

`src/lib/roles.ts` mirrors the backend's role hierarchy
(`VIEWER < EDITOR < PUBLISHER < ADMINISTRATOR`) purely for UI purposes
(hide/disable actions a role can't perform) — every mutating route is
independently guarded server-side by `@Roles()`/`RolesGuard`, so hiding a
button here is UX politeness, never the actual access control.
`src/lib/use-paginated.ts` is the shared server-pagination hook used by both
Products and Documents lists (and Units within Product Detail) — it has no
built-in "search" concept because the Products/Documents list endpoints
don't support a search query param server-side, and faking one client-side
over a single page of results would silently misrepresent the paginated
contract.

Auth/organization state lives in a small Zustand store
(`src/features/auth/auth-store.ts`): `{ user, token, organizations,
currentOrganizationId }` plus `login`, `logout`, `switchOrganization`, and
`bootstrap` (restores a session from a token already in `localStorage` on
page load). The token and current org id are persisted to `localStorage` so
a refresh doesn't log the user out; `api-client.ts` reads them from there
directly (via `session-storage.ts`) to attach `Authorization` and
`X-Organization-Id` headers, so there's no import cycle between the store
and the client.

## Public page states

`/p/:stableId` and `/u/:stableId` distinguish four states, each rendered
distinctly:

- **loading** — spinner while the request is in flight.
- **not found** — backend 404 (wrong/retired/foreign stableId — the backend
  deliberately doesn't say which, and the frontend doesn't try to).
- **network/server error** — request failed before/without a structured
  API response (e.g. the API is unreachable).
- **success, empty publications** — a real product/unit with nothing
  currently published (different message than "not found").
- **success, with publications** — the resolved list, grouped by language;
  a language selector only appears when more than one language is present
  in the response (derived from the data, never hardcoded).

"Öffnen" and "Herunterladen" both link directly to the publication's own
`downloadUrl` from the API response — the frontend never constructs a
download URL itself.

## What's built vs. deferred

Built so far: project scaffold, design system, API client + typed error
handling, auth/organization context, login screen, the public product/unit
pages (real states, real backend integration), and the authenticated
Products and Documents admin screens described above — including the
document revision lifecycle (upload → submit → approve → retire) wired to
the real state-transition endpoints, the authenticated QR/file blob-fetch
pattern, and role-aware hiding of mutation controls.

Deferred to later phases: the applicability rule editor (create/edit —
listing existing rules read-only is built), the publish wizard
(create/revoke — read-only publication lists are built), CSV import UI,
a real audit log UI (the per-object "Verlauf" tabs are honest placeholders,
see above), and the real dashboard (KPI tiles, charts).
