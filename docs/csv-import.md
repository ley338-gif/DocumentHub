# CSV Unit Import

Bulk-creates `Unit` rows from a CSV file (spec §33-35). Implemented in
`apps/api/src/imports/`. Requires the `EDITOR` role or higher, same as any
other write endpoint — see `docs/architecture.md`'s guard stack.

## Why two steps, not one

A single "upload and import" endpoint can't satisfy spec §34: the user must
see *every* row's validation result and consciously confirm before anything
is written, not discover after the fact that some rows silently failed. So
the import is a strict two-step flow:

1. **`POST /api/imports/units/preview`** — multipart CSV upload. Parses and
   validates every row, resolves references against the current database,
   and returns a full report. **Nothing is persisted at this step.** The
   validated rows are cached server-side, keyed by an opaque `importId`.
2. **`POST /api/imports/units/:importId/commit`** — bulk-inserts exactly the
   rows that were valid at preview time. No re-upload needed.

## Header contract

The first row must be a header row. Column names are matched
case-insensitively with punctuation/spacing ignored (`Serial Number`,
`serial_number`, and `serialNumber` are all the same column), so any of the
aliases below work:

| Canonical field | Required | Aliases | Meaning |
|---|---|---|---|
| `serialNumber` | yes | `serial_number`, `serial` | The unit's serial number. Must be unique within the file and within the organization. |
| `productReference` | yes | `product_reference`, `product`, `productId` | Resolves to a `Product` — see resolution order below. |
| `variantReference` | no | `variant_reference`, `variant` | Resolves to a `ProductVariant` that must belong to the resolved product. |
| `batchReference` | no | `batch_reference`, `batch` | Resolves to a `Batch` that must belong to the resolved product. |
| `manufacturedAt` | no | `manufactured_at`, `manufactured` | ISO-parseable date. |
| `deliveredAt` | no | `delivered_at`, `delivered` | ISO-parseable date. |
| `internalReference` | no | `internal_reference`, `internal_ref` | Free-text, stored on the unit as-is. |

Any other column is **ignored, not an error** — this lets a manufacturer
export their existing ERP unit list unmodified and just have the extra
columns skipped. Blank lines are skipped, not treated as errors. Values are
trimmed; blank cells are treated as "not provided" for optional fields.

### Editable mapping (not just auto-detection)

`POST /api/imports/units/preview` accepts an optional `columnMapping`
multipart field: a JSON object of canonical field name → column index
(0-based), e.g. `{"serialNumber": 2, "productReference": 0}`. Any field
you don't mention keeps its auto-detected value; a `null` (or empty
string) value for a field explicitly un-maps it even if auto-detection
would have matched something. This exists specifically so a UI can offer
a real "review and correct the column mapping" step — pre-filled with
`headers` (the raw header row) and `columnMapping` (what was actually
used) from the *previous* preview call — rather than either a hardcoded
mapping the user can't fix, or forcing them to rename their spreadsheet's
columns to match our aliases exactly. Re-calling `preview` with a
corrected mapping re-validates every row from scratch; nothing is
persisted by either call. See
`csv-parser.ts`'s `mapHeaders`/`detectHeaders` and
`csv-parser.spec.ts`/`csv-import.e2e-spec.ts` for the exact override
semantics (partial overrides, out-of-range indices ignored rather than
throwing, explicit un-mapping).

### Reference resolution

- **`productReference`**: tried against `Product.stableId` first (exact
  match), then `Product.internalProductNumber` (exact match, scoped to the
  organization). If more than one product shares the same
  `internalProductNumber` (that field isn't unique in the schema), the row
  is rejected as ambiguous rather than guessing.
- **`variantReference`**: tried against `ProductVariant.stableId` (global),
  then `ProductVariant.internalVariantNumber` (scoped to the already-resolved
  product). A variant that resolves but belongs to a different product than
  the row's `productReference` is a validation error, not silently ignored.
- **`batchReference`**: tried against `Batch.stableId` (global), then
  `Batch.internalReference`, then `Batch.name` (both scoped to the resolved
  product), in that order. Same cross-product-mismatch and ambiguity rules
  as variants.

All of this resolution is done in a handful of batched queries (`WHERE ...
IN (...)`) covering every row in the file at once — never one query per row
— which is what keeps a 5,000-row file's preview at well under a second in
practice (see `apps/api/test/csv-import.e2e-spec.ts`).

## Validation rules

A row is rejected (and excluded from `validRows`) if any of the following
hold. All errors for a row are reported together, not just the first one:

- `serialNumber` is missing.
- `productReference` is missing or doesn't resolve to exactly one product in
  the organization.
- `variantReference` / `batchReference` (if given) don't resolve, or resolve
  to a variant/batch belonging to a different product than the row's
  `productReference`.
- `manufacturedAt` / `deliveredAt` (if given) aren't parseable as dates.
- **The same `serialNumber` appears more than once in the file** — every
  occurrence is rejected (not just the second one), so the user sees every
  conflicting row in one pass, not one-at-a-time across repeated uploads.
- The `serialNumber` already exists for some unit in this organization
  (`@@unique([organizationId, serialNumber])` in `schema.prisma`). This is
  checked at preview time with a batched lookup so the preview report is
  accurate; it's also what the database itself enforces at commit time as a
  second, authoritative line of defense (see below).

## Preview response shape

```jsonc
{
  "importId": "…",             // opaque handle for the commit step
  "totalRows": 5000,            // non-blank data rows found in the file
  "validRows": [
    {
      "line": 2,                 // 1-based file line number (header = line 1)
      "serialNumber": "SN-000001",
      "productId": "…", "productName": "Widget",
      "variantId": "…" ,          // or null
      "batchId": null,
      "manufacturedAt": "2024-01-15T00:00:00.000Z",
      "deliveredAt": null,
      "internalReference": null
    }
  ],
  "invalidRows": [
    { "row": 3, "errors": ["serialNumber \"SN-000001\" already exists in this organization"] }
  ],
  "unknownColumns": ["Warehouse Location"]
}
```

## Commit and "never a silent partial import"

`unit.createMany` compiles to a single multi-row `INSERT`, which Postgres
executes atomically: if any row in that statement violates the
`(organizationId, serialNumber)` unique constraint — the realistic case is a
race where another request created one of the same serials between preview
and commit — the *entire statement* fails and **zero rows are inserted**.
That's what gives spec §34's "either all N rows import, or none do, and we
say exactly which ones collided" guarantee, without needing any manual
row-by-row bookkeeping. The commit still wraps the insert and the audit
write in a `prisma.$transaction` together, so the audit trail and the data
it describes can never diverge.

On that race, the commit responds with `IMPORT_VALIDATION_FAILED` (409) and
a `details.conflictingSerials` list of exactly which serials collided, and
the caller is expected to re-run preview to get a fresh, accurate
validation rather than blindly retrying commit.

A single `UNIT_IMPORTED` audit event is recorded per successful commit
(`after: { count, importId }`) — not one event per unit — matching the
"summarize the bulk operation" convention already used elsewhere (compare to
how a publish records one `PUBLICATION_CREATED` event, not per-document).

## Serial number decomposition

Every imported row computes `serialPrefix` / `serialSequence` /
`serialSeqLength` via the shared `parseSerial()` (`src/applicability/serial.ts`)
at **preview** time (so the preview response's line-level resolution is
already what will be written), and that same precomputed value — never
skipped, never recomputed differently — is what gets written by `commit`.
This is the same function the interactive "create unit" endpoint and the
applicability resolver use; skipping it would silently break serial-range
applicability rules for imported units.

## Why an in-memory store, not a `PendingImport` table

`PendingImportStore` (`src/imports/pending-import.store.ts`) is a plain
`Map<importId, …>` with a 30-minute TTL (lazily evicted on access), not a
persisted Prisma model. The data is disposable — re-uploading the CSV
regenerates an equivalent preview — and lives for at most half an hour, so a
migration plus a cleanup job felt like the wrong weight for what is
fundamentally a short-lived staging buffer between two steps of one HTTP
interaction. The real cost of this choice: it doesn't survive an API process
restart, and it doesn't work across multiple API instances behind a load
balancer without sticky sessions. That's an acceptable trade-off for the
current single-instance deployment target; if the API is horizontally
scaled, revisit this as a Redis-backed store or an actual `PendingImport`
table with a cron sweep.

## Limits

- Max upload size: 20MB (comfortably covers a file with 5,000+ rows).
- Tested at 5,000 rows end-to-end (preview + commit) well under the 30-second
  bound used elsewhere in this codebase's perf assertions (typically well
  under 1 second in practice, both for the bulk `unit.createMany` itself and
  for the batched reference-resolution queries during preview).
