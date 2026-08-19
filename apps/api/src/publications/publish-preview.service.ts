import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AppliedRuleSnapshot } from "../applicability/applicability.types";
import { toAppliedRuleSnapshot } from "../applicability/to-applied-rule-snapshot";
import { specificity } from "../applicability/specificity";
import { countAffectedUnits } from "../applicability/affected-units";
import { findConflicts } from "./conflict-detection";

// Structured scope, alongside `description` (a presentation convenience,
// not the source of truth). Keeping both means the UI never has to parse
// the German sentence back apart to build a form, a future localization
// pass doesn't need backend changes, and tests can assert on real fields
// instead of substring-matching prose.
export interface RulePreviewScope {
  productFamilyId: string | null;
  productFamilyName: string | null;
  productId: string | null;
  productName: string | null;
  variantId: string | null;
  variantName: string | null;
  batchId: string | null;
  batchName: string | null;
  unitId: string | null;
  unitSerialNumber: string | null;
  serialFrom: string | null;
  serialTo: string | null;
  validFrom: string | null;
  validUntil: string | null;
  explicitExclusion: boolean;
}

export interface RulePreview {
  ruleId: string;
  specificity: number;
  description: string;
  scope: RulePreviewScope;
  affectedUnitsCount: number;
}

export interface PublishPreviewResult {
  revisionId: string;
  documentId: string;
  language: string;
  revisionStatus: string;
  canPublish: boolean;
  rules: RulePreview[];
  totalAffectedUnitsCount: number;
  sampleSerials: string[];
  conflicts: PreviewConflict[];
}

export type ConflictReason =
  // The conflicting ACTIVE publication belongs to a genuinely different
  // revision — a real, competing applicability overlap that a human needs
  // to resolve (spec §19/§75).
  | "CONFLICT"
  // The "conflicting" ACTIVE publication IS this exact revision, already
  // published with the same rule set — findConflicts() correctly still
  // reports this (it's what stops a redundant duplicate publish, and the
  // real POST /api/publications would reject it too), but it is not a
  // competing-revision situation, so the UI must not present it as one.
  | "ALREADY_PUBLISHED";

export interface PreviewConflict {
  existingPublicationId: string;
  existingPublicationStableId: string;
  newRuleId: string;
  conflictingRuleId: string;
  reason: ConflictReason;
}

/**
 * Backend-authoritative "what would happen if I published this revision
 * right now" preview (spec §46-47, §63-65): affected units, plain-language
 * rule descriptions, and conflicts against currently active publications.
 * The UI renders this, it does not recompute it — same reasoning as
 * PublicationResolverService being the only place resolution happens.
 * Read-only: unlike the real publish, this takes no lock and is not
 * atomic with anything — it can go stale the instant another publish
 * happens, which is fine for a preview (the real publish re-runs
 * `findConflicts` for real, under a lock, and is the actual authority).
 */
@Injectable()
export class PublishPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(organizationId: string, revisionId: string): Promise<PublishPreviewResult> {
    const revision = await this.prisma.documentRevision.findFirst({
      where: { id: revisionId, organizationId },
      include: { document: true },
    });
    if (!revision) throw new AppError("NOT_FOUND", "Document revision not found");

    const liveRules = await this.prisma.applicabilityRule.findMany({ where: { organizationId, revisionId } });
    const ruleSnapshots: AppliedRuleSnapshot[] = liveRules.map(toAppliedRuleSnapshot);

    const [affected, rawConflicts] = await Promise.all([
      countAffectedUnits(this.prisma, organizationId, ruleSnapshots),
      findConflicts(this.prisma, organizationId, revision.documentId, revision.language, ruleSnapshots),
    ]);

    // findConflicts() itself is not touched — it stays the single, unwatered
    // source of truth PublishService also uses. Only here, in the read-only
    // preview's presentation mapping, do we tell "this IS the revision
    // being previewed, already active" apart from "a different revision
    // competes with this one" — see ConflictReason above.
    const conflicts: PreviewConflict[] = rawConflicts.map((c) => ({
      existingPublicationId: c.existingPublicationId,
      existingPublicationStableId: c.existingPublicationStableId,
      newRuleId: c.newRuleId,
      conflictingRuleId: c.conflictingRuleId,
      reason: c.existingPublicationRevisionId === revision.id ? "ALREADY_PUBLISHED" : "CONFLICT",
    }));

    const names = await this.resolveScopeNames(organizationId, ruleSnapshots);
    const rules: RulePreview[] = ruleSnapshots.map((rule) => ({
      ruleId: rule.id,
      specificity: specificity(rule),
      description: describeRule(rule, names),
      scope: toScope(rule, names),
      affectedUnitsCount: affected.perRule[rule.id] ?? 0,
    }));

    return {
      revisionId: revision.id,
      documentId: revision.documentId,
      language: revision.language,
      revisionStatus: revision.status,
      canPublish: revision.status === "APPROVED" && conflicts.length === 0,
      rules,
      totalAffectedUnitsCount: affected.totalDistinct,
      sampleSerials: affected.sampleSerials,
      conflicts,
    };
  }

  // Batch-resolves the human-readable names behind every scope id referenced
  // by any rule, so `describeRule` never has to show a raw uuid to a user.
  private async resolveScopeNames(
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
      this.prisma.productFamily.findMany({
        where: { organizationId, id: { in: [...ids.productFamilyId] } },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId, id: { in: [...ids.productId] } },
        select: { id: true, name: true },
      }),
      this.prisma.productVariant.findMany({
        where: { organizationId, id: { in: [...ids.variantId] } },
        select: { id: true, name: true },
      }),
      this.prisma.batch.findMany({
        where: { organizationId, id: { in: [...ids.batchId] } },
        select: { id: true, name: true },
      }),
      this.prisma.unit.findMany({
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
}

// Plain-language rendering of a rule's scope, for the UI to display
// directly (spec §63's "WENN Product = X UND Variant = H UND Serial >=
// N DANN gilt Revision" phrasing) without reimplementing any matching
// logic — this is just a description of what's already stored.
function describeRule(rule: AppliedRuleSnapshot, names: Map<string, string>): string {
  const name = (id: string) => names.get(id) ?? id;
  const parts: string[] = [];
  if (rule.productFamilyId) parts.push(`Produktfamilie ${name(rule.productFamilyId)}`);
  if (rule.productId) parts.push(`Produkt ${name(rule.productId)}`);
  if (rule.variantId) parts.push(`Variante ${name(rule.variantId)}`);
  if (rule.batchId) parts.push(`Charge ${name(rule.batchId)}`);
  if (rule.unitId) parts.push(`Einheit (Seriennummer ${name(rule.unitId)})`);
  if (rule.serialFrom && rule.serialTo) parts.push(`Seriennummer ${rule.serialFrom}–${rule.serialTo}`);
  else if (rule.serialFrom) parts.push(`Seriennummer ≥ ${rule.serialFrom}`);
  else if (rule.serialTo) parts.push(`Seriennummer ≤ ${rule.serialTo}`);
  if (rule.validFrom) parts.push(`gültig ab ${rule.validFrom}`);
  if (rule.validUntil) parts.push(`gültig bis ${rule.validUntil}`);

  const scope = parts.length > 0 ? parts.join(", ") : "Gesamte Organisation (keine Einschränkung)";
  return rule.explicitExclusion ? `Ausschluss: ${scope}` : `Gilt für: ${scope}`;
}

function toScope(rule: AppliedRuleSnapshot, names: Map<string, string>): RulePreviewScope {
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return {
    productFamilyId: rule.productFamilyId,
    productFamilyName: name(rule.productFamilyId),
    productId: rule.productId,
    productName: name(rule.productId),
    variantId: rule.variantId,
    variantName: name(rule.variantId),
    batchId: rule.batchId,
    batchName: name(rule.batchId),
    unitId: rule.unitId,
    unitSerialNumber: name(rule.unitId),
    serialFrom: rule.serialFrom,
    serialTo: rule.serialTo,
    validFrom: rule.validFrom,
    validUntil: rule.validUntil,
    explicitExclusion: rule.explicitExclusion,
  };
}
