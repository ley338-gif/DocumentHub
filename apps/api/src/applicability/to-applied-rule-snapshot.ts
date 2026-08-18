import { ApplicabilityRule } from "@prisma/client";
import { AppliedRuleSnapshot } from "./applicability.types";

/**
 * Converts a live ApplicabilityRule Prisma row into the JSON-safe
 * AppliedRuleSnapshot shape used both for freezing into
 * PublicationSnapshot.applicabilityRules at publish time and for feeding
 * the pure matching functions. BigInt sequences are stringified so the
 * result can round-trip through Prisma's Json column untouched.
 */
export function toAppliedRuleSnapshot(rule: ApplicabilityRule): AppliedRuleSnapshot {
  return {
    id: rule.id,
    productFamilyId: rule.productFamilyId,
    productId: rule.productId,
    variantId: rule.variantId,
    batchId: rule.batchId,
    unitId: rule.unitId,
    serialFrom: rule.serialFrom,
    serialFromPrefix: rule.serialFromPrefix,
    serialFromSequence: rule.serialFromSequence != null ? rule.serialFromSequence.toString() : null,
    serialTo: rule.serialTo,
    serialToPrefix: rule.serialToPrefix,
    serialToSequence: rule.serialToSequence != null ? rule.serialToSequence.toString() : null,
    validFrom: rule.validFrom ? rule.validFrom.toISOString() : null,
    validUntil: rule.validUntil ? rule.validUntil.toISOString() : null,
    explicitExclusion: rule.explicitExclusion,
  };
}
