import { Prisma, PrismaClient } from "@prisma/client";
import { AppliedRuleSnapshot } from "./applicability.types";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Builds the Unit `where` clause matching a rule's SCOPE only (the same
 * AND-of-set-fields semantics as `ruleScopeMatches` in specificity.ts) —
 * deliberately ignores `validFrom`/`validUntil` and `explicitExclusion`,
 * which are about when or whether the rule is active, not which units it
 * targets. This is used for the publish-impact preview ("how many units
 * would this scope reach"), a distinct, simpler question from "what is
 * currently published for unit X" (that's `PublicationResolverService`,
 * which this function is NOT a substitute for and must never be reused as
 * one — it reads live Unit/Product tables, which is correct for a forward-
 * looking preview but would be wrong for resolving what was actually
 * published in the past).
 */
export function ruleScopeToUnitWhere(organizationId: string, rule: AppliedRuleSnapshot): Prisma.UnitWhereInput {
  const where: Prisma.UnitWhereInput = { organizationId };

  if (rule.unitId) where.id = rule.unitId;
  if (rule.productId) where.productId = rule.productId;
  if (rule.variantId) where.variantId = rule.variantId;
  if (rule.batchId) where.batchId = rule.batchId;
  if (rule.productFamilyId) where.product = { productFamilyId: rule.productFamilyId };

  if (rule.serialFrom || rule.serialTo) {
    const prefix = rule.serialFromPrefix ?? rule.serialToPrefix ?? "";
    where.serialPrefix = prefix;
    const sequence: Prisma.BigIntFilter = {};
    if (rule.serialFromSequence !== null) sequence.gte = BigInt(rule.serialFromSequence);
    if (rule.serialToSequence !== null) sequence.lte = BigInt(rule.serialToSequence);
    where.serialSequence = sequence;
  }

  return where;
}

export interface AffectedUnitsResult {
  perRule: Record<string, number>;
  totalDistinct: number;
  sampleSerials: string[];
}

const SAMPLE_LIMIT = 20;

/**
 * Counts, per rule and in total (deduplicated), how many of the
 * organization's units fall inside the rules' scopes — inclusion rules are
 * unioned, then any unit also matching an explicit-exclusion rule's scope
 * is subtracted. This is a scope-only count (see `ruleScopeToUnitWhere`),
 * not a full resolution — it does not account for specificity ties against
 * *other* documents/revisions, only "does this rule set's scope reach this
 * unit at all".
 */
export async function countAffectedUnits(
  prisma: PrismaLike,
  organizationId: string,
  rules: AppliedRuleSnapshot[],
): Promise<AffectedUnitsResult> {
  const inclusionRules = rules.filter((r) => !r.explicitExclusion);
  const exclusionRules = rules.filter((r) => r.explicitExclusion);

  const perRule: Record<string, number> = {};
  for (const rule of inclusionRules) {
    perRule[rule.id] = await prisma.unit.count({ where: ruleScopeToUnitWhere(organizationId, rule) });
  }

  if (inclusionRules.length === 0) {
    return { perRule, totalDistinct: 0, sampleSerials: [] };
  }

  const inclusionWhere: Prisma.UnitWhereInput = {
    organizationId,
    OR: inclusionRules.map((r) => ruleScopeToUnitWhere(organizationId, r)),
  };

  const exclusionWhere: Prisma.UnitWhereInput | undefined =
    exclusionRules.length > 0 ? { OR: exclusionRules.map((r) => ruleScopeToUnitWhere(organizationId, r)) } : undefined;

  const where: Prisma.UnitWhereInput = exclusionWhere
    ? { AND: [inclusionWhere, { NOT: exclusionWhere }] }
    : inclusionWhere;

  const [totalDistinct, sample] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({ where, select: { serialNumber: true }, take: SAMPLE_LIMIT, orderBy: { serialSequence: "asc" } }),
  ]);

  return { perRule, totalDistinct, sampleSerials: sample.map((u) => u.serialNumber) };
}
