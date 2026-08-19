# Document Hub — Frontend (`apps/web`)

React + TypeScript + Vite frontend for Document Hub. Built so far: the
shared design system, the authenticated app shell with a bare login flow,
the public QR-scan pages, the authenticated Products and Documents admin
screens (with the document revision lifecycle), the Applicability Rule
Editor (builder + matrix, with a live backend preview), and the Publish
Wizard. CSV import UI, audit UI, and real dashboard KPIs are deliberately
not built yet — see "What's built" below.

## Design invariant: this UI is a pure consumer of the backend's applicability logic

The Applicability Editor and Publish Wizard (`src/features/applicability/`,
`src/features/publications/`) render **only** numbers and conflict
descriptions that came back from a real API response — principally
`GET /api/publications/preview/:revisionId`
(`apps/api/src/publications/publish-preview.service.ts`). Specifically:

- **Specificity**, **affected-unit counts**, and **conflicts** always come
  from the preview response's `rules[].specificity`,
  `rules[].affectedUnitsCount`/`totalAffectedUnitsCount`, and `conflicts[]`
  — never computed, sorted-by-inference, or estimated client-side. See
  `apps/api/src/applicability/specificity.ts` for why: specificity scoring
  and rule matching are real domain logic (spec §16, §63) that must stay in
  one place.
- **Rule descriptions** (the German "Gilt für: …" strings) come from the
  preview's `rules[].description` whenever a preview is available. A raw,
  best-effort fallback (`fallbackDescription` in `RuleBuilderView.tsx`) is
  shown only before the first preview has loaded, or for a Viewer session
  that can never call the preview endpoint (see below) — it is cosmetic
  only and is replaced the moment a real description exists.
- The **real** publish (`POST /api/publications`) is the only authority on
  whether a revision can actually be published; the preview is advisory and
  can go stale between the user viewing it and confirming. The Publish
  Wizard treats a `APPLICABILITY_CONFLICT` from that POST (even after a
  clean preview) as the system working correctly, not a UI bug — see
  `docs/publication-lifecycle.md`.
- The preview endpoint is Editor+ only server-side. A Viewer session must
  never call it — `useApplicabilityData`'s `canPreview` flag (gated by
  `hasRole(role, "EDITOR")`) turns the call off entirely for a Viewer, who
  instead sees an honest "this needs Editor+" message alongside the raw
  rule list (which Viewers can read).

**Future contributors: do not add client-side code that decides whether a
rule matches a unit, computes specificity, or decides whether two rules
conflict.** If a screen needs any of those, call the preview endpoint (or
extend it server-side) rather than reimplementing the logic here.

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
| `/app/documents/:id` | required | Document detail — tabs: Übersicht, Revisionen (state-machine actions gated by role + current status, real backend errors surfaced via `Toast`; APPROVED revisions get a "Veröffentlichen" action for Publisher+ that opens the Publish Wizard), Anwendbarkeit (rule editor: Builder + Matrix, see below), Veröffentlichungen (read-only), Dateien (upload form), Verlauf (placeholder). |
| `/app/documents/:id/publish/:revisionId` | required, Publisher+ | Publish Wizard — 5 steps (Revision → Anwendbarkeit → Auswirkung → Konflikte → Bestätigung). Steps 3–4 call `GET /api/publications/preview/:revisionId` fresh every time the user reaches step 3, never reusing a stale fetch. Step 5's "Jetzt veröffentlichen" calls the real `POST /api/publications`; a non-Publisher or a non-APPROVED revision sees an explanatory blocked state instead of the wizard (defense in depth — the same actions are already hidden in the Revisions tab). |
| `/app/publications`, `/app/audit` | required | Sidebar nav stubs — no pages behind them yet (later phases: real audit UI; a dedicated publications list page — the Document Detail "Veröffentlichungen" tab and the Publish Wizard already cover the real, working flows). |

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
    documents/              DocumentsListPage, DocumentDetailPage + tabs/, api.ts
                            (also carries the applicability-rule CRUD calls,
                            since they're revision-scoped), CreateDocumentDialog
    applicability/          The rule editor: useApplicabilityData (shared
                            fetch of rules + backend preview for a revision),
                            ScopeFields/UnitPicker (scope-picker form fields —
                            UnitPicker is a real-match lookup + paginated
                            browse, since GET /api/units only supports an
                            EXACT serialNumber match, not substring search),
                            RuleFormDrawer (create/edit), RuleBuilderView
                            (list + live preview panel + conflict banner),
                            RuleMatrixView (sortable table, same underlying
                            data as the builder), ConflictBanner (shared with
                            the Publish Wizard)
    publications/            api.ts (getPublishPreview, publishRevision,
                            revokePublication, listPublications),
                            PublishWizardPage (5-step publish flow)
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

Also now built: the Applicability Rule Editor (create/edit/delete with a
live backend preview — see "Design invariant" above — plus a Matrix view
reading the same underlying data) and the Publish Wizard (5-step flow
ending in a real `POST /api/publications`, with honest handling of both a
clean publish and a real `APPLICABILITY_CONFLICT` rejection).

Deferred to later phases: CSV import UI, a real audit log UI (the
per-object "Verlauf" tabs are honest placeholders, see above), a dedicated
publication history/revoke UI beyond the read-only "Veröffentlichungen" tab
(`revokePublication` exists in `features/publications/api.ts` but has no UI
wired to it yet), and the real dashboard (KPI tiles, charts).

### Known limitations in the Applicability Editor (documented judgment calls)

- The Produktfamilie/Produkt/Variante/Charge scope pickers fetch up to 100
  rows each (`listFamilies`/`listProducts`/`listVariants`/`listBatches`
  with `pageSize: 100`) since none of those list endpoints support a
  family-scoped filter server-side for products. An organization with more
  than 100 products would not see all of them in the picker. The
  Produkt-by-Produktfamilie narrowing in `ScopeFields.tsx` is a client-side
  filter of that fetched page purely for picker convenience — it never
  affects specificity/conflict/affected-unit numbers, which always come
  from the backend preview.
- The Unit picker cannot do substring/type-ahead search because
  `GET /api/units` only supports an exact `serialNumber` match
  (`apps/api/src/products/products.service.ts::listUnits`). It offers an
  exact-match lookup plus a real server-paginated browse list instead of
  faking a "contains" search the API doesn't provide.
- The preview call in the Applicability tab and the Publish Wizard is
  triggered on mount and after every mutation (create/update/delete a
  rule), plus on-demand via a "Vorschau aktualisieren" button — not on
  every keystroke of an unsaved form. A preview describes *persisted*
  rules; firing it against not-yet-saved form state would blur "what the
  backend decided" with "what the user is currently typing."
- Re-previewing an already-published revision will show it "conflicting"
  with its own active publication (same document+language, same rules, same
  specificity) — this is real, correct backend behavior
  (`findConflicts` in `apps/api/src/publications/conflict-detection.ts`
  compares against every ACTIVE publication of the same document+language,
  including the revision's own), not a UI bug: you cannot re-publish an
  already-actively-published revision, and the UI surfaces that honestly.
