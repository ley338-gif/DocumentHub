import { AppliedRuleSnapshot } from "../applicability/applicability.types";

// Dimensions compared field-by-field. If both rules set a value for a
// dimension and the values differ, that dimension alone proves the two
// rules can never apply to the same unit — the rules are disjoint on that
// axis. If either rule leaves the dimension unset, it acts as a wildcard on
// that axis (matches anything) and cannot prove disjointness.
const ID_FIELDS = ["productFamilyId", "productId", "variantId", "batchId", "unitId"] as const;

function serialBound(prefix: string | null, sequence: string | null): bigint | null {
  if (prefix === null || sequence === null) return null;
  return BigInt(sequence);
}

/**
 * Conservative overlap check used for publish-time conflict detection
 * (spec §75). Returns true whenever the two rules' scopes COULD both match
 * some unit — i.e. we could not prove they are disjoint. False negatives
 * (silently allowing a real conflict) are worse than false positives here,
 * so any ambiguity resolves to "could overlap".
 */
export function rulesCouldOverlap(a: AppliedRuleSnapshot, b: AppliedRuleSnapshot): boolean {
  for (const field of ID_FIELDS) {
    const av = a[field];
    const bv = b[field];
    if (av && bv && av !== bv) return false; // proven disjoint on this axis
  }

  const aHasRange = Boolean(a.serialFrom || a.serialTo);
  const bHasRange = Boolean(b.serialFrom || b.serialTo);

  if (aHasRange && bHasRange) {
    const aPrefix = a.serialFromPrefix ?? a.serialToPrefix;
    const bPrefix = b.serialFromPrefix ?? b.serialToPrefix;
    if (aPrefix !== null && bPrefix !== null && aPrefix !== bPrefix) {
      return false; // different serial families, cannot overlap
    }

    const aFrom = serialBound(a.serialFromPrefix, a.serialFromSequence);
    const aTo = serialBound(a.serialToPrefix, a.serialToSequence);
    const bFrom = serialBound(b.serialFromPrefix, b.serialFromSequence);
    const bTo = serialBound(b.serialToPrefix, b.serialToSequence);

    // Interval overlap test treating a missing bound as unbounded.
    const disjoint = (aTo !== null && bFrom !== null && aTo < bFrom) || (bTo !== null && aFrom !== null && bTo < aFrom);
    if (disjoint) return false;
  }

  // Nothing proved the rules disjoint — conservatively flag as overlapping.
  return true;
}
