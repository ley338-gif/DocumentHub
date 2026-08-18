import { AppliedRuleSnapshot, UnitContext } from "./applicability.types";
import { ParsedSerial, serialInRange } from "./serial";

/**
 * Specificity scoring (spec §16). A rule can set multiple scope fields at
 * once (spec §63, e.g. productId + variantId + serialFrom); the rule's
 * overall specificity is the MAX across all set fields, not a sum — the
 * most specific field present dominates the ranking, so e.g. a rule with a
 * serial range is exactly as specific as a serial-range-only rule,
 * regardless of what else it also constrains.
 *
 * 0   = fully unscoped ("applies to the whole organization" — lower than
 *       family; deliberately below spec's family=100 floor, see module doc
 *       below for why an intentional org-wide rule is still legal).
 * 100 = productFamilyId set
 * 200 = productId set
 * 300 = variantId set
 * 400 = batchId set
 * 500 = serialFrom or serialTo set
 * 600 = unitId set
 */
export function specificity(rule: AppliedRuleSnapshot): number {
  let score = 0;
  if (rule.productFamilyId) score = Math.max(score, 100);
  if (rule.productId) score = Math.max(score, 200);
  if (rule.variantId) score = Math.max(score, 300);
  if (rule.batchId) score = Math.max(score, 400);
  if (rule.serialFrom || rule.serialTo) score = Math.max(score, 500);
  if (rule.unitId) score = Math.max(score, 600);
  return score;
}

function toParsed(prefix: string | null, sequence: string | null): ParsedSerial | null {
  if (prefix === null || sequence === null) return null;
  return { prefix, sequence: BigInt(sequence), sequenceLength: 0 };
}

/**
 * Whether `rule` matches the given unit context at the given point in time.
 * ALL non-null scope fields on the rule must match (AND semantics, spec
 * §63). A fully-unscoped rule (no scope fields at all) matches every unit
 * context in the organization.
 *
 * `explicitExclusion` handling (documented simplification for MVP): an
 * excluded rule is evaluated as "this scope is excluded from resolution
 * entirely" — i.e. if an exclusion rule's scope matches the context, this
 * function returns false regardless of specificity, and the caller should
 * treat the whole candidate as filtered out for that context rather than
 * attempt to rank exclusions against inclusions. We do not implement
 * partial/negative-specificity semantics; this is the simplest defensible
 * MVP behavior per the brief.
 */
export function ruleMatchesUnitContext(
  rule: AppliedRuleSnapshot,
  context: UnitContext,
  effectiveAt: Date,
): boolean {
  if (rule.explicitExclusion) return false;
  return ruleScopeMatches(rule, context, effectiveAt);
}

/**
 * Scope+time match, ignoring `explicitExclusion`. Exported separately so
 * callers that need to detect "does this exclusion rule's scope cover this
 * context" (to filter a whole publication out of resolution, per the
 * documented exclusion behavior) can reuse the same matching logic without
 * going through the exclusion short-circuit in ruleMatchesUnitContext.
 */
export function ruleScopeMatches(rule: AppliedRuleSnapshot, context: UnitContext, effectiveAt: Date): boolean {
  if (rule.productFamilyId && rule.productFamilyId !== context.productFamilyId) return false;
  if (rule.productId && rule.productId !== context.productId) return false;
  if (rule.variantId && rule.variantId !== context.variantId) return false;
  if (rule.batchId && rule.batchId !== context.batchId) return false;
  if (rule.unitId && rule.unitId !== context.unitId) return false;

  if (rule.serialFrom || rule.serialTo) {
    if (!context.parsedSerial) return false;
    const from = toParsed(rule.serialFromPrefix, rule.serialFromSequence);
    const to = toParsed(rule.serialToPrefix, rule.serialToSequence);
    const serial = { ...context.parsedSerial, sequenceLength: context.parsedSerial.sequenceLength ?? 0 };
    if (!serialInRange(serial, from, to)) return false;
  }

  if (rule.validFrom && effectiveAt < new Date(rule.validFrom)) return false;
  if (rule.validUntil && effectiveAt > new Date(rule.validUntil)) return false;

  return true;
}
