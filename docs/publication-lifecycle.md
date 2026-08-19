# Publication lifecycle

## States

```
Publication.status: ACTIVE -> SUPERSEDED | REVOKED
```

`SUPERSEDED` is defined in the schema but **is not produced anywhere in
this MVP** — see "No auto-supersede" below. Only `ACTIVE -> REVOKED` is
implemented, via `PATCH /api/publications/:id/revoke` (Publisher+). Revoke
is one-way; there is no un-revoke. Re-publishing requires approving and
publishing a new revision, which creates a new `Publication` row.

## The publish transaction (`PublishService.publish`)

Runs entirely inside one `SERIALIZABLE` Prisma `$transaction`:

1. Re-load the revision inside the transaction; must be `APPROVED` or the
   whole thing throws `INVALID_STATE_TRANSITION` (a manipulated client
   hitting `/publications` for a `DRAFT` revision cannot succeed).
2. Defense-in-depth role check (`PUBLISHER`+) even though the controller's
   `@Roles("PUBLISHER")` already gates the endpoint.
3. Take a Postgres advisory lock,
   `pg_advisory_xact_lock(hashtext(organizationId::documentId::language))`,
   so two concurrent publishes for the same resolution key can't race past
   the conflict check simultaneously. Combined with `SERIALIZABLE`
   isolation, this is the concurrency guard called for in the brief (one of
   the two acceptable options — advisory lock was chosen for simplicity).
4. Load the revision's *live* `ApplicabilityRule` rows and convert them to
   the JSON-safe `AppliedRuleSnapshot[]` shape.
5. Conflict check against every currently-`ACTIVE` publication sharing the
   same resolution key (`documentId` + `language`) — see
   `docs/applicability-resolution.md` for `rulesCouldOverlap`. Any conflict
   throws `APPLICABILITY_CONFLICT` and rolls back the entire transaction —
   nothing is written.
6. If no conflict: create the `Publication` row (`ACTIVE`) and its 1:1
   `PublicationSnapshot` row, freezing document metadata, file identity
   (`storageKey`/`sha256`/`filename`/`mimeType`/`fileSize`), and the rule
   snapshot from step 4.
7. Emit a `PUBLICATION_CREATED` audit event inside the same transaction.

## No auto-supersede — why

The brief's original instinct was "publishing a new revision of the same
document+language should mark the previous one SUPERSEDED." Working through
the acceptance scenario (Manual 4.1 for serials 1–1999, Manual 4.2 for
serials ≥2000) shows why that's wrong for this system: both publications
are meant to stay **simultaneously ACTIVE and resolvable forever** — they
apply to disjoint serial ranges of the same document. If publish
auto-superseded every prior ACTIVE publication with the same resolution
key, 4.1 would stop resolving for units 1–1999 the moment 4.2 was
published, which is a data-loss bug dressed up as a lifecycle transition.

Generalizing: by construction, two `ACTIVE` publications for the same
`documentId`+`language` that both survived the conflict check in step 5
above must have **non-overlapping** scopes (that's exactly what the
conflict check is protecting). There is therefore never a well-defined,
automatic reason to supersede one because of the other — supersession would
have to be a deliberate, human decision about a *specific* prior
publication, not a blanket "same resolution key" rule. Implementing that
deliberate flow (e.g. "publish this revision AND explicitly retire
publication X") is out of scope for this MVP; the schema keeps a
`SUPERSEDED` status and `supersededAt`/`supersededById` columns ready for
it, but no code path currently produces that transition.

The only real lifecycle-ending transition implemented is the explicit,
human-triggered `revoke`.

## Publish preview (`GET /api/publications/preview/:revisionId`, Editor+)

Before a revision is approved and published, the UI needs to answer "what
would this actually do" — affected units, a plain-language rendering of the
current rule set, and whether it would conflict — without an editor having
to guess or the frontend having to reimplement any matching logic. This
endpoint is the backend-authoritative source for that: it reuses the exact
same `specificity()`/`rulesCouldOverlap()` functions used at real publish
time (the conflict check was extracted into
`src/publications/conflict-detection.ts` specifically so `PublishService`
and `PublishPreviewService` cannot drift apart), plus a new scope-only unit
count (`src/applicability/affected-units.ts`).

Two things make this a *preview*, not a second implementation of publish:

- It is read-only and takes no lock — unlike the real publish, it is not
  atomic with anything and can go stale the instant another publish
  happens. That's fine: `POST /api/publications` re-runs `findConflicts`
  for real, under the advisory lock, and is the actual authority. The
  preview exists to make failure predictable in the UI, not to replace the
  real check.
- "Affected units" is a deliberately simpler question than "what would
  resolve." It counts organization units whose identity (product/variant/
  batch/unit/serial) falls inside the rule's *scope*, ignoring
  `validFrom`/`validUntil` and specificity ties against unrelated
  documents — it does not attempt to simulate the full resolver. Answering
  "how many units does this rule's scope reach" is what an editor actually
  needs while authoring a rule; simulating full resolution against every
  other active publication in the org for a preview is unnecessary
  complexity this MVP does not take on.

Response shape includes both a `description` (plain-language German string,
a presentation convenience) and a structured `scope` object per rule
(`productFamilyId`/`productId`/`variantId`/`batchId`/`unitId` plus their
resolved names, `serialFrom`/`serialTo`, `validFrom`/`validUntil`,
`explicitExclusion`) — the description is not the source of truth, so a UI
never has to parse it back apart to build an edit form, a future
localization pass needs no backend change, and tests can assert on real
fields instead of substring-matching prose.

**Tenant isolation (IDOR):** the revision lookup is scoped by
`{id: revisionId, organizationId}` using the *caller's* `organizationId`
from `TenantGuard` (never a value from the request body/query), so
requesting another organization's revision id returns a generic
`NOT_FOUND` — identical to "doesn't exist" — never a 403 that would
confirm the id belongs to someone else, and never any of that
organization's data. Covered by `test/publish-preview-hardening.e2e-spec.ts`.

**Domain-primitive parity:** `affected-units.ts`'s `ruleScopeToUnitWhere`
translates a rule's scope into a SQL `WHERE` clause — a different
execution strategy than `ruleScopeMatches` (specificity.ts), which
evaluates the same scope as an in-memory predicate against one unit at a
time (used by `PublicationResolverService` and conflict detection). Both
must implement the *same* semantics from two different code paths, which
is exactly the kind of thing that silently drifts over time. Rather than
trust that by inspection, `publish-preview-hardening.e2e-spec.ts` cross-
checks them against real data: for the same set of units and rules, it
filters in-memory with `ruleScopeMatches` and counts in SQL with
`countAffectedUnits`, and asserts the numbers agree.

**"Already published" vs a real conflict:** `findConflicts()` correctly
reports a "conflict" when you preview (or attempt to re-publish) a
revision that is already ACTIVE with an unchanged rule set — it's
comparing the revision's live rules against every ACTIVE publication for
the same resolution key, and the revision's own existing publication is
one of those. This is desirable at the *detection* level: it's exactly
what stops a redundant duplicate `POST /api/publications` for the same
revision (the real endpoint still correctly 409s). We deliberately did
**not** change `findConflicts()` or `PublishService` to special-case this
— conflict detection stays a single, unwatered implementation.

What changed is presentation only: `PublishPreviewService` compares each
conflict's `existingPublicationRevisionId` (now returned by
`findConflicts`) against the revision being previewed and labels the
result `reason: "ALREADY_PUBLISHED"` instead of `"CONFLICT"` when they're
the same revision. `canPublish` is unaffected — it's still `false`
whenever any conflict is present, matching the fact that the real publish
endpoint would still reject either case; only the *reason* differs, so a
UI can render "Diese Revision ist für diesen Gültigkeitsbereich bereits
veröffentlicht" instead of a red "Konflikt mit einer anderen
Veröffentlichung" for a case that isn't actually a competing revision.
See `test/publish-preview-already-published.e2e-spec.ts`.

## Frozen scope names

`PublicationSnapshot.applicabilityRules` freezes each rule's scope ids
(`productId`, `variantId`, `batchId`, `unitId`, `productFamilyId`) — that
alone is not enough for a historical view (Publication History) to show
anything human-readable without joining back to the live `Product`/
`ProductVariant`/`Batch`/`Unit` tables, which would defeat the entire
point of the snapshot: **a later rename would silently change what
history displays.**

`PublishService.publish()` resolves and bakes the actual names
(`productFamilyName`, `productName`, `variantName`, `batchName`,
`unitSerialNumber`) into each rule INSIDE the publish transaction, via the
same `resolveScopeNames()`/`withResolvedNames()` helpers
(`src/applicability/resolve-scope-names.ts`) that `PublishPreviewService`
uses to build its live preview — one implementation, reused, not
duplicated. Once written, nothing ever re-resolves these from a live
table; every historical read (`GET /api/publications`, `GET
/api/publications/:id`) returns exactly what was frozen.

Proven directly: `test/publication-history-api.e2e-spec.ts`'s "freezes the
product name at publish time" test publishes a rule scoped to a product
named "PumpMaster 400", renames the live product to "PumpMaster 500", and
asserts — via the API, the list endpoint, and a direct DB read — that the
snapshot still says "PumpMaster 400".

Publications published *before* this change have no name fields in their
`applicabilityRules` (they're `undefined` on old JSON blobs) — a UI must
treat their absence as "name unavailable" (e.g. fall back to the raw id)
rather than crash; there is no backfill migration for existing rows.

## Publication History API

`GET /api/publications` (Viewer+, paginated) supports:

- `status` (`ACTIVE`/`SUPERSEDED`/`REVOKED`)
- `documentId` — filters via `snapshot.documentId` (the frozen record, not
  the live `DocumentRevision.documentId` — though for a given revision
  these never differ, matching by way of the snapshot keeps the query
  consistent with "publications describe what was published," not "what a
  revision currently points at")
- `productId` — filters via `snapshot.scopedProductIds`, a denormalized
  array populated at publish time from every non-exclusion rule's direct
  `productId` (see the field's doc comment in `schema.prisma`). **Narrow,
  documented scope**: a rule scoped only by `productFamilyId`/`variantId`/
  `batchId`/`unitId` (no direct `productId`) does not populate this array,
  so filtering by product will not surface it even though that rule may in
  practice apply to units of that product. Extending this to full
  scope-inheritance filtering is a possible future enhancement, not
  attempted here — it would require either a live resolution pass (which
  breaks pagination) or a much larger denormalization.
- `from`/`to` — inclusive range on `publishedAt`.

`GET /api/publications/:id` (Viewer+) returns a single publication with
its snapshot, 404 if it doesn't exist or belongs to another organization
(never a 403 that would confirm the id belongs to someone else).

Both endpoints enrich each publication with `publishedByName`/
`revokedByName` — `Publication.publishedById`/`revokedById` are plain
string columns (no Prisma relation to `User`), so these are resolved via
a single batched `OrganizationMembership` query per page (never one
lookup per row), scoped to the organization so a name never leaks for a
user who isn't actually a member.

## Immutability

Once a `DocumentRevision` reaches `APPROVED` or beyond, or has ever
appeared in any `Publication` (checked via the `publications` relation),
its identity fields (`storageKey`, `sha256`, `revision`, `language`,
`documentId`) become frozen — see
`RevisionsService.assertContentMutable()`. Applicability rules on a
revision are editable up until the revision is `RETIRED`; nothing edits a
`PublicationSnapshot` after creation — there is no update path for it in
this codebase at all.
