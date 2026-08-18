# Applicability & Publication Resolution

This is the module the whole product's correctness depends on. It has two
layers: (1) pure, DB-free matching/scoring functions in `src/applicability`,
and (2) the resolver/publish services in `src/publications` that use them
against real data.

## Serial number handling (`src/applicability/serial.ts`)

A serial number is treated as `[free-form prefix] + [trailing numeric run]`.
The trailing run of digits becomes a comparable `BigInt` sequence;
everything before it is the prefix (case-sensitive, exact match required).
Two serials — or a serial and a range bound — are only comparable when
their prefixes are identical. This is deliberate: it stops
`"PM400-002183"` from ever being compared numerically against a bare
`"002000"` just because both happen to contain digits. A serial with no
trailing digits gets `sequence = 0n` and can only be range-matched by exact
prefix equality with an empty range.

This decomposition (`serialPrefix`/`serialSequence`/`serialSeqLength`) is
computed once, at write time, for both `Unit.serialNumber` and
`ApplicabilityRule.serialFrom`/`serialTo`, and is never implicitly
recomputed — so range semantics stay stable even if parsing logic evolves
later (a schema migration would be required to reinterpret existing data).

## Specificity scoring (`src/applicability/specificity.ts`)

```
0   unscoped (applies org-wide)
100 productFamilyId set
200 productId set
300 variantId set
400 batchId set
500 serialFrom or serialTo set
600 unitId set
```

A rule's specificity is the **max** across all its set scope fields, not a
sum. Per spec §63's example (`productId + variantId + serialFrom` → still
just 500), the *most specific single field present* dominates the ranking.
This keeps the scoring simple and total-order-comparable across rules that
combine dimensions differently.

We extended the spec's floor: a **fully unscoped** rule (every scope field
null) is legal and scores **0**, one level below `productFamilyId`. This
covers an intentional "applies to the entire organization" rule (e.g. a
company-wide legal notice) without accidentally treating an
under-specified rule as "matches everything" by omission — the all-null
case is only reached when *no* scope field was provided at all, which
`ApplicabilityRulesService` accepts explicitly (there is no separate "is
this really unscoped?" confirmation step; the null state itself is the
explicit signal).

## Matching (`ruleMatchesUnitContext` / `ruleScopeMatches`)

All non-null scope fields on a rule must match the given `UnitContext`
(AND semantics, spec §63's "Product = X AND Variant = H AND Serial >= N"
example). `validFrom`/`validUntil`, when set, are inclusive bounds checked
against the resolution's `effectiveAt`.

`ruleScopeMatches` is the scope+time check with no opinion on
`explicitExclusion`; `ruleMatchesUnitContext` wraps it and short-circuits to
`false` for any exclusion rule (an exclusion rule never counts as a
"regular" match).

### Exclusion rules — MVP behavior

`explicitExclusion: true` rules are handled at the resolver level, not
inside a single rule's match result: if an exclusion rule's *scope* matches
the unit context (checked via `ruleScopeMatches`, ignoring the exclusion
flag), the **entire publication** is filtered out of resolution for that
context, at any specificity — it never becomes a candidate, regardless of
what its other (non-exclusion) rules would have matched. We deliberately
did not implement partial/negative-specificity semantics (e.g. "exclude
just this one unit from an otherwise-matching family-level rule while still
matching the publication for everything else"); that's a more expressive
model left for a later phase if a real use case demands it.

## Resolution key & conflicts

Matches are grouped by **resolution key** = `documentId + "::" + language`.
Different documents (e.g. "Manual" vs "Safety Notice") never compete, even
for the same unit — spec §18. Within one resolution-key group, the
candidate(s) at the **maximum** matched specificity win. If more than one
distinct `documentRevisionId` ties at that max, the group is reported as a
**conflict** rather than guessed at (spec §19/§75) — the resolver never
picks a "most recent" or otherwise arbitrary winner among ties.

## Publish-time conflict detection (`src/publications/rules-overlap.ts`)

General set-overlap reasoning between two arbitrary rule scopes is not
attempted in this MVP. Instead, `rulesCouldOverlap(a, b)` is a conservative,
field-by-field check: any ID dimension (`productFamilyId`/`productId`/
`variantId`/`batchId`/`unitId`) that both rules set to *different* values
proves them disjoint; for serial ranges, differing prefixes or a proven gap
between the closed/open intervals proves them disjoint. Anything not proven
disjoint is reported as **could overlap** — false positives (flagging a
non-conflict) are preferred over false negatives (silently allowing a real
conflict) here, per the brief.

`PublishService.publish()` only runs this check between the new revision's
rules and each currently-**ACTIVE** publication sharing the same resolution
key, and only between rule pairs at **equal specificity** (different
specificity ties are resolved automatically by the resolver's max-wins
rule, not by blocking publish). A confirmed overlap at equal specificity
throws `APPLICABILITY_CONFLICT` and rolls back the whole transaction — see
`docs/publication-lifecycle.md` for the transaction and locking details.

## Historical resolution and snapshot immutability

`PublicationResolverService.resolvePublications()` reads **only** from
`Publication` + `PublicationSnapshot`. Live `Unit`/`Product` tables are read
exactly once, to resolve `unitId` → `{productId, productFamilyId,
variantId, batchId, parsedSerial}` identity — never to read current
applicability rules or product metadata. This is what makes resolving
"what applied as of `effectiveAt` in the past" correct even after products
are renamed or rules are edited afterwards: the snapshot never changes
after publish.
