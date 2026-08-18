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
