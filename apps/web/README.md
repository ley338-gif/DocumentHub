# Document Hub — Frontend (`apps/web`)

React + TypeScript + Vite frontend for Document Hub. This is the first
slice: the shared design system, the authenticated app shell with a bare
login flow, and the public QR-scan pages. The rest of the authenticated
admin UI (products, documents, applicability editor, publish wizard, CSV
import, audit UI, real dashboard) is deliberately not built yet — see
"What's built" below.

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
| `/app` (index) | required | Dashboard — placeholder only this run. |
| `/app/products`, `/app/documents`, `/app/publications`, `/app/audit` | required | Sidebar nav stubs — no pages behind them yet (later phases). |

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
    auth/               auth-store.ts (Zustand), LoginPage, RequireAuth (route guard)
    app-shell/           AppLayout — wires AppShell + Sidebar + org switcher for /app/*
    dashboard/            placeholder DashboardPage
    public/               public QR-scan pages: PublicProductPage, PublicUnitPage,
                           PublicationList, LanguageSelector, usePublicResource (loading/
                           not-found/error state machine), useLanguageFilter
```

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

Built this run: project scaffold, design system, API client + typed error
handling, auth/organization context, login screen, empty authenticated
dashboard, and the public product/unit pages (real states, real backend
integration).

Deferred to later phases: products list, product/document detail,
applicability rule editor, publish wizard, CSV import UI, audit log UI, the
real dashboard (KPI tiles, charts), and full RBAC-aware admin chrome beyond
the bare shell.
