import { Prisma, PrismaClient } from "@prisma/client";
import { AppliedRuleSnapshot } from "./applicability.types";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Batch-resolves the human-readable names behind every scope id referenced
 * by any of the given rules (never one query per rule). Shared by
 * PublishPreviewService (to render `description`/`scope` in the read-only
 * preview) and PublishService (to bake names into the immutable
 * PublicationSnapshot at publish time — see withResolvedNames below) so
 * there is exactly one place that knows how to turn an id into a name.
 */
export async function resolveScopeNames(
  prisma: PrismaLike,
  organizationId: string,
  rules: AppliedRuleSnapshot[],
): Promise<Map<string, string>> {
  const ids = {
    productFamilyId: new Set<string>(),
    productId: new Set<string>(),
    variantId: new Set<string>(),
    batchId: new Set<string>(),
    unitId: new Set<string>(),
  };
  for (const rule of rules) {
    if (rule.productFamilyId) ids.productFamilyId.add(rule.productFamilyId);
    if (rule.productId) ids.productId.add(rule.productId);
    if (rule.variantId) ids.variantId.add(rule.variantId);
    if (rule.batchId) ids.batchId.add(rule.batchId);
    if (rule.unitId) ids.unitId.add(rule.unitId);
  }

  const [families, products, variants, batches, units] = await Promise.all([
    prisma.productFamily.findMany({
      where: { organizationId, id: { in: [...ids.productFamilyId] } },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { organizationId, id: { in: [...ids.productId] } },
      select: { id: true, name: true },
    }),
    prisma.productVariant.findMany({
      where: { organizationId, id: { in: [...ids.variantId] } },
      select: { id: true, name: true },
    }),
    prisma.batch.findMany({
      where: { organizationId, id: { in: [...ids.batchId] } },
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({
      where: { organizationId, id: { in: [...ids.unitId] } },
      select: { id: true, serialNumber: true },
    }),
  ]);

  const names = new Map<string, string>();
  for (const f of families) names.set(f.id, f.name);
  for (const p of products) names.set(p.id, p.name);
  for (const v of variants) names.set(v.id, v.name);
  for (const b of batches) names.set(b.id, b.name);
  for (const u of units) names.set(u.id, u.serialNumber);
  return names;
}

/**
 * Returns a copy of `rule` with its name fields filled in from `names`
 * (falling back to null for any id that resolveScopeNames couldn't find —
 * should not happen for live rules, but never throw over a display field).
 * The caller decides what to do with the result: PublishPreviewService
 * discards these once it's built its own `scope`/`description`;
 * PublishService writes the enriched rule straight into
 * PublicationSnapshot.applicabilityRules, which is what freezes the names
 * permanently regardless of later renames.
 */
export function withResolvedNames(rule: AppliedRuleSnapshot, names: Map<string, string>): AppliedRuleSnapshot {
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return {
    ...rule,
    productFamilyName: name(rule.productFamilyId),
    productName: name(rule.productId),
    variantName: name(rule.variantId),
    batchName: name(rule.batchId),
    unitSerialNumber: name(rule.unitId),
  };
}
