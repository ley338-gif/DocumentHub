# Audit

Append-only trail of critical actions (spec §36-37). `AuditEvent` rows are
written by `AuditService.record()` — see `src/audit/audit.service.ts` — and
there is no update or delete path anywhere in the codebase; the only way to
add a row is `record()`, called from inside the same transaction as the
mutation it describes wherever one exists (e.g. `PublishService.publish()`),
so a publication can never exist without its `PUBLICATION_CREATED` event or
vice versa.

## API

`GET /api/audit` (Viewer+, paginated) supports:

- `objectType` — exact match (e.g. `Product`, `DocumentRevision`, `Publication`)
- `action` — exact match (e.g. `PUBLICATION_CREATED`, `REVISION_APPROVED`, `UNIT_IMPORTED`)
- `actorId` — exact match
- `from`/`to` — inclusive range on `timestamp`
- `search` — free-text, case-insensitive, matched against `action`,
  `objectType`, and `objectId` only. Deliberately **not** a full-text
  search across the `before`/`after` JSON payloads — that's a
  meaningfully bigger feature (would need either a GIN index on JSON
  content or an external search index) and isn't attempted here.

Every event is enriched with `actorName` — `AuditEvent.actorId` is a plain
string (nullable, for any future system-initiated event), resolved via a
single batched `OrganizationMembership` query per page, the same pattern
`PublicationsController.withActorNames` uses. A name is never resolved (and
never leaks) for a user who isn't a member of the requesting organization.

## What the UI owns vs. what it must not touch

The backend emits machine action codes (`PUBLICATION_CREATED`,
`REVISION_APPROVED`, `UNIT_IMPORTED`, ...) and structured `before`/`after`
JSON. A UI is free to map an action code to a human-readable label (e.g.
"Dokument veröffentlicht") and to render `before`/`after` nicely — but it
must never reinterpret, recompute, or filter what actually happened; the
raw event data (`action`, `objectType`, `objectId`, `before`, `after`,
`timestamp`, `actorId`) must stay traceable exactly as stored, typically in
an expandable detail view alongside the human-readable summary, not instead
of it.

## Known gaps (documented, not fixed here)

- `requestId`, `ipAddress`, `userAgent` are accepted by `AuditService.record()`
  but **no caller currently populates them** — every existing `AuditEvent`
  row has these as `null`. Wiring them up would mean touching every call
  site across every module (likely via a request-scoped interceptor
  instead), which is out of scope for this pass. A UI must render their
  absence as "not recorded," not assume a bug.
