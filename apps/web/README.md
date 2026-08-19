# Document Hub — Frontend (`apps/web`)

React + TypeScript + Vite frontend for Document Hub. Built so far: the
shared design system, the authenticated app shell with a bare login flow,
the public QR-scan pages, the authenticated Products and Documents admin
screens (with the document revision lifecycle), the Applicability Rule
Editor (builder + matrix, with a live backend preview), the Publish
Wizard, the CSV unit import wizard, Publication History, and the Audit UI.
Only real dashboard KPIs are deliberately not built yet — see "What's
built" below.

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

## Design invariant: Publication History renders only the frozen snapshot

`src/features/publications/PublicationHistoryPage.tsx` and
`PublicationDetailDrawer.tsx` render **only** fields off
`publication.snapshot` (`GET /api/publications` /
`GET /api/publications/:id`, which include `.snapshot` and the resolved
`publishedByName`/`revokedByName`). In particular, every product/variant/
batch/unit name inside `snapshot.applicabilityRules[]` (`productName`,
`variantName`, `batchName`, `unitSerialNumber`, `productFamilyName`) is
the name as it was **at publish time** — frozen server-side by
`PublishService` into `PublicationSnapshot.applicabilityRules`, per
`apps/api/src/applicability/applicability.types.ts`'s
`AppliedRuleSnapshot` and `docs/publication-lifecycle.md`'s "Frozen scope
names" section.

**This screen must never call `GET /api/products/:id`,
`GET /api/documents/:id`, or any other live-lookup endpoint to backfill a
name for anything shown inside a publication's historical context.**
Verified manually: publish a revision scoped to a product named "PumpMaster
400", then rename the live product to "PumpMaster 500" — both the
Publication History list and its detail drawer must keep showing "PumpMaster
400" for that publication, because the live product row and the frozen
snapshot are deliberately different data sources. The one intentional
exception is the page's own product/document **filter dropdowns** — those
legitimately query the live `GET /api/products`/`GET /api/documents` lists,
because picking a filter value is a present-tense action, not a rendering
of history.

Rule formatting (`src/features/publications/ruleFormat.ts`) is presentation
only — it joins already-resolved fields into a readable string and never
recomputes or looks up anything. A snapshot written before the naming
feature shipped has `productName`/etc. as `undefined`; the formatter falls
back to a shortened id rather than crashing or showing nothing.

## Audit UI: label/route mapping tables, not reinterpretation

`src/features/audit/action-labels.ts` maps a backend `action` code (plus
its `before`/`after` JSON) to a human-readable German label, and
`src/features/audit/object-routes.ts` maps an `objectType` to an in-app
route. Both are presentation-only lookup tables — per `docs/audit.md`,
the UI may label an event but must never reinterpret, recompute, or filter
what actually happened. The raw `action`, `objectType`, `objectId`,
`before`, and `after` always stay fully visible in `AuditDetailDrawer.tsx`
regardless of how the row is labeled. Extend these two tables together
whenever a new `audit.record()` call site is added on the backend — see
`src/features/audit/api.ts`'s `KNOWN_ACTIONS`/`KNOWN_OBJECT_TYPES` (built
via `grep -rn "action:" apps/api/src` / `grep -rn "objectType:"
apps/api/src`), which back the filter dropdowns and must stay in sync with
the same two tables.

**Judgment call — Actor filter source:** `GET /api/organizations/:id/members`
is Administrator-only server-side, so the Audit UI cannot call it (a Viewer
must be able to use this page). The Actor filter is instead populated from
the distinct `actorId`/`actorName` pairs seen on the currently loaded page
of audit events — a smaller, role-safe list rather than the full org
roster. Documented here rather than silently narrowed.

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
| `/app/products` | required | Products list — server-paginated, `Table`/`Pagination`. Editor+ sees an "Einheiten importieren" action here that opens the CSV import wizard (see below). |
| `/app/products/import` | required, Editor+ | CSV unit import wizard — 4 steps (Datei → Spalten zuordnen → Prüfen → Importieren). See "CSV unit import" below. |
| `/app/products/:id` | required | Product detail — tabs: Übersicht, Varianten, Einheiten, Dokumentation (read-only "currently applicable documents" via `GET /api/publications/resolve?productId=`), Öffentlicher Zugriff (stable ID, public URL, QR via authenticated blob fetch), Verlauf (placeholder, see below). Supports `?tab=<key>` to deep-link straight to a tab (e.g. `?tab=units`, used by the import wizard's post-commit "Zur Einheiten-Übersicht" link). |
| `/app/documents` | required | Documents list — server-paginated; Sprachen/Aktuelle Revision are derived client-side from each document's revisions (the API doesn't compute them). |
| `/app/documents/:id` | required | Document detail — tabs: Übersicht, Revisionen (state-machine actions gated by role + current status, real backend errors surfaced via `Toast`; APPROVED revisions get a "Veröffentlichen" action for Publisher+ that opens the Publish Wizard), Anwendbarkeit (rule editor: Builder + Matrix, see below), Veröffentlichungen (read-only), Dateien (upload form), Verlauf (placeholder). |
| `/app/documents/:id/publish/:revisionId` | required, Publisher+ | Publish Wizard — 5 steps (Revision → Anwendbarkeit → Auswirkung → Konflikte → Bestätigung). Steps 3–4 call `GET /api/publications/preview/:revisionId` fresh every time the user reaches step 3, never reusing a stale fetch. Step 5's "Jetzt veröffentlichen" calls the real `POST /api/publications`; a non-Publisher or a non-APPROVED revision sees an explanatory blocked state instead of the wizard (defense in depth — the same actions are already hidden in the Revisions tab). |
| `/app/publications` | required | Publication History — server-paginated list of every `Publication` (ACTIVE/SUPERSEDED/REVOKED, unfiltered by default) via `GET /api/publications`, with server-side filters for status/product/document/date-range. Row click (or `?open=<id>` deep link, used by the Audit UI's Publication resource links) opens a detail `Drawer` with the full frozen snapshot: document metadata, SHA-256, the complete `applicabilityRules` array, and publish/revoke actor+timestamp. See "Publication History data-source invariant" below — this is the one screen in the app that must never call `GET /api/products/:id` or `GET /api/documents/:id`. |
| `/app/audit` | required | Audit UI — server-paginated `GET /api/audit` with filters for free-text search, action, resource type, actor, and date range. Action-code → German label and objectType → route mappings live in `src/features/audit/action-labels.ts` and `src/features/audit/object-routes.ts` respectively — extend those two tables together whenever the backend adds a new `audit.record()` call site (see their file-level comments for the exact `grep` commands used to enumerate the current, complete set). Row click opens a detail `Drawer` with the true `action` code, `objectId`, full `before`/`after` JSON, and an explicit "nicht erfasst" for `requestId`/`ipAddress`/`userAgent` (always null today — see `docs/audit.md`). Read-only: no edit or delete control exists anywhere in this UI, matching the backend, which has no such endpoint at all. |

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

## CSV unit import (`src/features/imports/`)

`ImportWizardPage.tsx` implements the spec's 4-step wizard (1 Datei, 2
Spalten zuordnen, 3 Prüfen, 4 Importieren) against
`POST /api/imports/units/preview` and `POST /api/imports/units/:importId/commit`
(`apps/api/src/imports/`). A few integration notes for future contributors:

- **Entry point is top-level, not nested under a product.** `productReference`
  is resolved per-row inside the CSV itself
  (`imports.service.ts`'s `preview()`), so a single import can span many
  products — there is no "import into this product" scoping at the API
  level to nest the UI under. The action lives on the Products list
  instead (`/app/products/import`), gated Editor+.
- **Nothing is persisted before the explicit commit in step 4.** Both
  preview calls (auto-detect on step 1→2, and the mapping-aware
  re-validation on step 2→3) only stage a disposable, 30-minute-TTL
  in-memory buffer server-side (`PendingImportStore`); step 4's commit is
  the only call that writes anything, and it imports exactly the
  previously-staged `importId`'s valid-row set.
- **The backend stays the sole validation authority.** The wizard never
  invents its own "is this mapping valid" or "is this row valid" logic —
  every count and every error string rendered in step 3 comes straight
  from the preview response. Required-field enforcement in step 2 is
  purely visual (a `*` marker); if the user proceeds with a required field
  unmapped, the next preview call comes back with `FILE_VALIDATION_FAILED`
  from the server and that's what's shown.
- **Auto-detection can fail so completely the backend never returns a
  header list.** `imports.service.ts`'s `preview()` throws
  `FILE_VALIDATION_FAILED` *before* returning `headers`/`columnMapping`
  when it can't find a `serialNumber`/`productReference` column at all
  (e.g. the file's headers don't match any known alias). Without a
  workaround, the wizard could never reach step 2 to let the user fix
  this by hand — exactly the case the editable-mapping feature exists
  for. The fix is client-side only (no `apps/api` change): on that
  specific error, `parseFirstLineLocally()` reads just the file's first
  line and splits it on commas (no quote-handling — deliberately not a
  full CSV parser) purely to populate the mapping step's dropdown
  options. This is **never** used to decide validity — the next preview
  call, with the user's chosen mapping, is what actually validates
  against the server, exactly like the auto-detected path.
- **Duplicate-in-file vs. other-invalid categorization is string-matching
  on a known backend message, documented as a compromise.** The API
  returns `invalidRows[].errors` as free-text sentences with no
  structured "why" category. Rows whose serial number repeats within the
  same file always carry the exact, stable phrase `"appears more than
  once in this file"` (`csv-parser.ts`'s `findDuplicateSerialsInFile`), so
  the review step's "davon Duplikate in der Datei" stat is derived by
  matching that phrase (`DUPLICATE_IN_FILE_PHRASE` in
  `ImportWizardPage.tsx`). This couples the UI to backend message text —
  if that message ever changes, the count silently reads as 0 rather than
  failing loudly. It does **not** affect what actually gets imported:
  that's driven entirely by `validRows`/`invalidRows` as returned, never
  re-derived from this categorization. Revisit if the API ever gains a
  structured error code/category per invalid row.
- **5,000+ row files stay usable.** Step 3 never renders the full
  `validRows`/`invalidRows` arrays — only the first 30 valid rows and
  first 50 invalid-row errors are rendered (with a "… und N weitere"
  note), while the headline counts (`totalRows`, `validRows.length`,
  `invalidRows.length`) always reflect the true, untruncated totals from
  the server.

## Design system (`src/design-system/`)

Tokens (`tokens.css`) are CSS custom properties derived from the reference
mockups in `images/*.png` — color, spacing, radii, typography scale,
shadows. Components are plain React + CSS Modules (one `.module.css` per
component), mobile-first:

`AppShell`, `Sidebar`, `PageHeader` (title/subtitle/actions, plus an
optional `breadcrumbs` prop — see below), `Breadcrumbs`, `Tabs`, `Table`
(generic, column-driven, no built-in fetching; rows with `onRowClick` are
keyboard-focusable and Enter/Space-activatable), `FilterBar`, `Badge` /
`StatusBadge`, `Dialog`, `Drawer` (both trap focus and restore it to the
triggering element on close — see "Dialog/Drawer a11y" below), `Pagination`,
`Toast` (`ToastProvider` + `useToast()`), `Button`, `Input`, `Select`,
`Spinner`, `EmptyState`, `LoadingState`, `ErrorState`. All are exported
from `src/design-system/index.ts`.

**These are the conventions this pass established — later phases (per-page
polish, critical workflows, history/audit, dashboard, public page) should
extend this system rather than inventing a parallel one:**

### Status color mapping (`Badge`/`StatusBadge`)

One tone table, `STATUS_TONE` in `Badge.tsx`, is the single source of truth
for how any backend status string is colored — never inline a hex color or
a second mapping elsewhere:

| Tone | Statuses | Meaning |
| --- | --- | --- |
| `success` (green) | `ACTIVE`, `APPROVED`, `PUBLISHED`, `"Gültig"` | live/good state |
| `neutral` (grey) | `DRAFT`, `RETIRED`, `SUPERSEDED` | inert/no-action-needed state |
| `info` (blue) | `IN_REVIEW` | in-progress state |
| `warning` (amber) | `INVITED` | pending-action state |
| `danger` (red) | `REVOKED`, `SUSPENDED`, `EXPIRED` | stopped/problem state |

Any status string not in the table falls back to `neutral` rather than
throwing, so a new backend status never breaks rendering — but it should
still be added to the table deliberately rather than left on the fallback.
Use `<StatusBadge status={raw} />` (colors by the raw backend value) or
`<StatusBadge status={raw} label={germanLabel} />` when the raw value
shouldn't be shown verbatim (e.g. `RevisionsTab.tsx`'s `STATUS_LABEL` map)
— coloring always stays keyed off the real status, only the text changes.

### Button hierarchy (`Button`)

Variants: `primary` (exactly one per view — "the one main action"),
`secondary` (everything else actionable, including "Abbrechen"/"Zurück"),
`outline` (secondary-weight actions that want less visual weight still,
e.g. header utility actions like "Produktfamilien verwalten"), `ghost`
(lowest-emphasis inline actions, e.g. a per-row "Bearbeiten"/"Herunterladen"
button inside a table), `danger` (destructive/irreversible actions —
revoke, delete, retire; red background, used at minimum for the Revisions
tab's "Zurückziehen" and the Applicability rule editor's "Löschen"). This
pass audited every `<Button>` call site across `src/features/` and found
the hierarchy already consistently applied — no `secondary`-styled delete
buttons or competing-primary bugs were found; the `danger` variant already
existed and was already wired to the two real destructive actions above.

### Breadcrumbs (`Breadcrumbs`, `PageHeader`'s `breadcrumbs` prop)

`Breadcrumbs` (`design-system/Breadcrumbs.tsx`) takes `items:
{ label, to? }[]` — omit `to` on the last (current-page) item. Pass it to
`PageHeader` via `breadcrumbs={[...]}`, rendered above the title; it
replaces a page's old plain "Zurück"/"Zurück zur Übersicht" navigation
button (removed from `ProductDetailPage`, `DocumentDetailPage`, and
`PublishWizardPage`'s header actions in this pass — their normal-state
"go back" button was redundant once the breadcrumb trail exists; error
states there still keep a plain fallback button since there's no product/
document name to build a breadcrumb from). A page-level "Abbrechen" button
that performs a real action (e.g. the Publish Wizard's) is *not* replaced
by breadcrumbs — breadcrumbs are for hierarchy navigation, not for
cancel/confirm actions. Only these three pages were wired up in this pass;
retrofitting the remaining detail-ish views is explicitly left to later
phases (see task brief) — follow the same `{ label, to? }[]` shape and the
same "keep a real action button, drop a pure-navigation one" rule.

### Empty / loading / error states

- `EmptyState` — `title` (required), optional `icon`/`description`/`action`.
  Pass it as a `Table`'s `emptyMessage` (it renders fine inside the table's
  centered empty `<td>`) whenever a list can be legitimately empty, with an
  `action` button when there's an obvious next step (e.g. "Neues Produkt").
  Reserve a bare string `emptyMessage` for the transient "Lädt…" case.
- `LoadingState` — wraps `Spinner` with one consistent centered
  size/spacing convention for a whole view/section being loading. Keep a
  bare inline `<Spinner size={..} />` (no wrapper) only for small
  in-context indicators next to other content (e.g. inside a preview panel
  that's still loading while the rest of the page is interactive).
- `ErrorState` — **the one correct way to render a caught error.** Pass
  `error={caughtErrorOrString}` and it renders `ApiError.userMessage` (the
  German, user-safe message) when given an `ApiError`, the string as-is
  when given one, or a German `fallback` otherwise — never a raw error code
  or English backend message. Optional `onRetry`/`retryLabel` add a retry
  button. This pass converted 5 real call sites across 3 feature areas
  (`ProductsListPage`, `DocumentsListPage` in products/documents;
  `ProductDetailPage`, `DocumentDetailPage`; `PublicationHistoryPage`,
  `AuditLogPage`, `PublishWizardPage` in publications/audit) from a bare
  `<p role="alert">{error}</p>` to `<ErrorState .../>`. The many remaining
  `<p role="alert">{message}</p>` sites (mostly inline business-rule
  messages, e.g. "nur APPROVED Revisionen können veröffentlicht werden",
  which aren't caught exceptions) were deliberately left alone — only
  genuine caught-error rendering should move to `ErrorState`.

### Dialog/Drawer a11y (`useFocusTrap`)

Both `Dialog` and `Drawer` use the shared `useFocusTrap(open, containerRef)`
hook (`design-system/useFocusTrap.ts`): on open, focus moves into the panel
— respecting a field's own `autoFocus` if one already claimed it, otherwise
the first focusable element — and Tab/Shift+Tab is trapped inside the
panel; on close, focus returns to whatever triggered the open. Escape-to-
close was already wired up per-component and is unchanged. **Judgment call
worth knowing about:** the trigger element must be captured during React's
*render* phase (`if (open && !wasOpenRef.current) triggerRef.current =
document.activeElement`), not inside a `useEffect` — a field's native
`autoFocus` attribute is applied during React's commit phase, before
passive effects run, so capturing inside an effect reliably grabs the
wrong element (something already inside the just-opened panel) instead of
the real trigger. Table rows with `onRowClick` were made keyboard-focusable
(`tabIndex={0}`, `role="button"`, Enter/Space activation) specifically so
this restore-focus behavior has something focusable to return to when a
Drawer/Dialog was opened by clicking a table row.

### Tokens (`tokens.css`)

Already a real scale before this pass (spacing `--space-1`…`--space-12`,
type `--font-size-xs`…`--font-size-2xl`, radii `--radius-sm/md/lg/full`,
the full status color set above). This pass's actual finding: several
feature files had drifted into inline `style={{ color: "var(--color-token,
#hardcodedhex)" }}` fallbacks, some referencing tokens that don't exist at
all (`--color-danger` — the real token is `--color-danger-text`;
`--color-surface-subtle` — the real token is `--color-surface-muted`). Fixed
across `PublishWizardPage.tsx`, `FilesTab.tsx`, `PublicationHistoryPage.tsx`,
`AuditLogPage.tsx`, `ImportWizardPage.tsx`, and the `applicability/*`
files to reference the real token with no hardcoded fallback. **Convention
going forward: never add a hex fallback to a `var(--token, #hex)` — if the
token doesn't already exist in `tokens.css`, add it there, don't
work around it inline.**

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
    imports/                 api.ts (previewImport — multipart, commitImport),
                            ImportWizardPage (4-step CSV unit import flow —
                            see "CSV unit import" above)
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
reading the same underlying data), the Publish Wizard (5-step flow ending
in a real `POST /api/publications`, with honest handling of both a clean
publish and a real `APPLICABILITY_CONFLICT` rejection), and the CSV unit
import wizard (see "CSV unit import" above) — verified end-to-end with a
real 5,000-row file (4,970 valid / 20 duplicate-in-file / 10 other-invalid),
confirming exact preview counts, zero persistence before commit, exactly
4,970 units actually created, a genuine page reload showing them in the
Units tab, and a same-file re-upload correctly reporting all 4,970 as
already-existing (no silent double-import).

Also now built: Publication History (`/app/publications`, list + detail
drawer, server-paginated with status/product/document/date-range filters —
see "Design invariant: Publication History renders only the frozen
snapshot" above) and the Audit UI (`/app/audit`, list + detail drawer,
server-paginated with search/action/resource-type/actor/date-range filters
— see "Audit UI: label/route mapping tables" above).

Deferred to later phases: the per-object "Verlauf" tabs on Product/Document
Detail remain honest placeholders (see above — the audit endpoint has no
`objectId` filter to build a true per-object trail from without fetching
the whole org log), a dedicated revoke action in the Publication History UI
itself (`revokePublication` exists in `features/publications/api.ts`, but
no screen calls it yet — Publication History stays a pure read-only
history view by design, matching the spec's read-only scope for this
screen), the remaining admin screens (member management beyond what
Organizations already expose), and the real dashboard (KPI tiles, charts).

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
