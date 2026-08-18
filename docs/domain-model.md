# Domain model

See `apps/api/prisma/schema.prisma` for the authoritative field-level
definitions. This document is the narrative map.

## Tenancy

`Organization` is the tenant boundary. `User` is global (one login can
belong to many organizations). `OrganizationMembership` joins the two with a
`MembershipRole` (VIEWER / EDITOR / PUBLISHER / ADMINISTRATOR) and a
`MembershipStatus`. Every tenant-scoped table carries its own
`organizationId` column directly (not inferred through joins), so every
query can and does filter on it directly.

## Product domain

```
ProductFamily (optional grouping)
  └─ Product
       ├─ ProductVariant
       ├─ Batch
       └─ Unit (serialized instance; optionally tagged with a variant and/or batch)
```

A `Unit`'s `variantId`/`batchId`, when set, must reference a variant/batch
that belongs to the *same* `Product` — Prisma's FK constraints alone can't
express that cross-check (they only guarantee the variant/batch exists, not
that it's the right product's), so `ProductsService` enforces it explicitly
before every unit create/update.

Every `Unit.serialNumber` is decomposed once, at write time, into
`serialPrefix` / `serialSequence` / `serialSeqLength` (see
`docs/applicability-resolution.md` for the parsing rule). This
decomposition is never silently recomputed — it is the stable basis for all
serial-range applicability matching.

## Document domain

```
Document
  └─ DocumentRevision (revision, language) — status: DRAFT → IN_REVIEW → APPROVED → RETIRED
       ├─ ApplicabilityRule[] (mutable while not yet published)
       └─ Publication[] (created only by the publish transaction)
              └─ PublicationSnapshot (1:1, immutable, frozen copy of everything that mattered at publish time)
```

`(documentId, revision, language)` is unique — the same document can't have
two revisions with the same revision string + language.

## Applicability domain

An `ApplicabilityRule` attaches to a specific `DocumentRevision` and
optionally scopes to any combination of `productFamilyId` / `productId` /
`variantId` / `batchId` / `unitId` / a serial range
(`serialFrom`..`serialTo`) / a validity window
(`validFrom`..`validUntil`), plus an `explicitExclusion` flag. All set scope
fields are AND-ed together. See `docs/applicability-resolution.md` for
scoring and matching semantics.

## Publication domain

`Publication` is the append-only record of "this revision was published";
`PublicationSnapshot` is its immutable twin, holding a frozen copy of the
document metadata, file identity, and the applicability rule set *as it
stood at the moment of publish*. Resolution never reads live
`ApplicabilityRule`/`Product`/`Unit` rows for the matching decision — only
the snapshot. See `docs/publication-lifecycle.md`.

## Audit domain

`AuditEvent` is a flat, append-only table: `organizationId`, `actorId`
(nullable), `action`, `objectType`, `objectId`, optional `before`/`after`
JSON, and request metadata. Every mutating service call in this codebase
writes one of these — see `AuditService.record()`.
