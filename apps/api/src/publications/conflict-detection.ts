import { Prisma, PrismaClient } from "@prisma/client";
import { AppliedRuleSnapshot } from "../applicability/applicability.types";
import { specificity } from "../applicability/specificity";
import { rulesCouldOverlap } from "./rules-overlap";

export interface ConflictDescriptor {
  existingPublicationId: string;
  existingPublicationStableId: string;
  newRuleId: string;
  conflictingRuleId: string;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Finds every ACTIVE publication of the same resolution key (documentId +
 * language) whose rule set could overlap `newRuleSnapshots` at equal
 * specificity. Shared by the real publish transaction (`PublishService`,
 * which runs this inside its `$transaction` under an advisory lock so the
 * check and the write are atomic) and the read-only publish-preview
 * endpoint (`PublishPreviewService`, no lock — a preview is advisory by
 * nature and can go stale between preview and the real publish, which
 * re-runs this exact check for real).
 */
export async function findConflicts(
  prisma: PrismaLike,
  organizationId: string,
  documentId: string,
  language: string,
  newRuleSnapshots: AppliedRuleSnapshot[],
): Promise<ConflictDescriptor[]> {
  const existingActive = await prisma.publication.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      snapshot: { documentId, language },
    },
    include: { snapshot: true },
  });

  const conflicts: ConflictDescriptor[] = [];

  for (const existing of existingActive) {
    if (!existing.snapshot) continue;
    const existingRules = existing.snapshot.applicabilityRules as unknown as AppliedRuleSnapshot[];
    for (const newRule of newRuleSnapshots) {
      if (newRule.explicitExclusion) continue;
      const newSpecificity = specificity(newRule);
      for (const existingRule of existingRules) {
        if (existingRule.explicitExclusion) continue;
        if (specificity(existingRule) !== newSpecificity) continue;
        if (rulesCouldOverlap(newRule, existingRule)) {
          conflicts.push({
            existingPublicationId: existing.id,
            existingPublicationStableId: existing.stableId,
            newRuleId: newRule.id,
            conflictingRuleId: existingRule.id,
          });
        }
      }
    }
  }

  return conflicts;
}
