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

## Immutability

Once a `DocumentRevision` reaches `APPROVED` or beyond, or has ever
appeared in any `Publication` (checked via the `publications` relation),
its identity fields (`storageKey`, `sha256`, `revision`, `language`,
`documentId`) become frozen — see
`RevisionsService.assertContentMutable()`. Applicability rules on a
revision are editable up until the revision is `RETIRED`; nothing edits a
`PublicationSnapshot` after creation — there is no update path for it in
this codebase at all.
