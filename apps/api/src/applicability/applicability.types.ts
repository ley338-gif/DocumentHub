// Shared shape for an applicability rule, usable both against a live
// ApplicabilityRule Prisma row (at publish/snapshot time) and against the
// frozen JSON copy stored in PublicationSnapshot.applicabilityRules (at
// resolution time). Keeping this identical is what lets
// ruleMatchesUnitContext() and specificity() be reused unchanged by both the
// mutable-rule CRUD path and the immutable-snapshot resolution path.
export interface AppliedRuleSnapshot {
  id: string;

  productFamilyId: string | null;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  unitId: string | null;

  serialFrom: string | null;
  serialFromPrefix: string | null;
  serialFromSequence: string | null; // stringified BigInt (JSON-safe)
  serialTo: string | null;
  serialToPrefix: string | null;
  serialToSequence: string | null; // stringified BigInt (JSON-safe)

  validFrom: string | null; // ISO date
  validUntil: string | null; // ISO date

  explicitExclusion: boolean;

  // Resolved display names, as they were at the moment this snapshot was
  // frozen (publish time) — NOT looked up live. Optional because a live
  // ApplicabilityRule (still being edited, not yet published) has no
  // reason to carry these; toAppliedRuleSnapshot() never sets them.
  // PublishService populates them (via resolveScopeNames()) only on the
  // copy that actually gets written into PublicationSnapshot.applicabilityRules,
  // which is what makes a later rename of the product/variant/batch/unit
  // powerless to change what a historical Publication History view shows —
  // see docs/publication-lifecycle.md's "Frozen scope names" section.
  productFamilyName?: string | null;
  productName?: string | null;
  variantName?: string | null;
  batchName?: string | null;
  unitSerialNumber?: string | null;
}

// Minimal identity context for a unit, resolved once (live Product/Unit
// lookup is allowed here — it's identity resolution, not applicability
// matching) and then fed into the pure matching functions.
export interface UnitContext {
  unitId: string | null;
  productId: string;
  productFamilyId: string | null;
  variantId: string | null;
  batchId: string | null;
  parsedSerial: { prefix: string; sequence: bigint; sequenceLength?: number } | null;
}
