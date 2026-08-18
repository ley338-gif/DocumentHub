import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { parseSerial } from "./serial";
import { CreateApplicabilityRuleDto, UpdateApplicabilityRuleDto } from "./dto/applicability-rule.dto";

@Injectable()
export class ApplicabilityRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, revisionId: string) {
    await this.requireRevision(organizationId, revisionId);
    return this.prisma.applicabilityRule.findMany({ where: { organizationId, revisionId } });
  }

  async create(organizationId: string, revisionId: string, actorId: string, dto: CreateApplicabilityRuleDto) {
    const revision = await this.requireRevision(organizationId, revisionId);
    this.assertMutable(revision);
    await this.crossCheckScope(organizationId, dto);

    const serialFromParsed = dto.serialFrom ? parseSerial(dto.serialFrom) : null;
    const serialToParsed = dto.serialTo ? parseSerial(dto.serialTo) : null;

    const rule = await this.prisma.applicabilityRule.create({
      data: {
        organizationId,
        revisionId,
        productFamilyId: dto.productFamilyId,
        productId: dto.productId,
        variantId: dto.variantId,
        batchId: dto.batchId,
        unitId: dto.unitId,
        serialFrom: dto.serialFrom,
        serialFromPrefix: serialFromParsed?.prefix,
        serialFromSequence: serialFromParsed?.sequence,
        serialTo: dto.serialTo,
        serialToPrefix: serialToParsed?.prefix,
        serialToSequence: serialToParsed?.sequence,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        explicitExclusion: dto.explicitExclusion ?? false,
        createdById: actorId,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "APPLICABILITY_RULE_CREATED",
      objectType: "ApplicabilityRule",
      objectId: rule.id,
      after: this.serializeForAudit(rule),
    });

    return rule;
  }

  async update(
    organizationId: string,
    revisionId: string,
    id: string,
    actorId: string,
    dto: UpdateApplicabilityRuleDto,
  ) {
    const revision = await this.requireRevision(organizationId, revisionId);
    this.assertMutable(revision);
    const before = await this.prisma.applicabilityRule.findFirst({ where: { id, organizationId, revisionId } });
    if (!before) throw new AppError("NOT_FOUND", "Applicability rule not found");

    await this.crossCheckScope(organizationId, dto);

    const serialFromParsed = dto.serialFrom !== undefined ? (dto.serialFrom ? parseSerial(dto.serialFrom) : null) : undefined;
    const serialToParsed = dto.serialTo !== undefined ? (dto.serialTo ? parseSerial(dto.serialTo) : null) : undefined;

    const updated = await this.prisma.applicabilityRule.update({
      where: { id },
      data: {
        productFamilyId: dto.productFamilyId,
        productId: dto.productId,
        variantId: dto.variantId,
        batchId: dto.batchId,
        unitId: dto.unitId,
        serialFrom: dto.serialFrom,
        serialFromPrefix: serialFromParsed === undefined ? undefined : serialFromParsed?.prefix ?? null,
        serialFromSequence: serialFromParsed === undefined ? undefined : serialFromParsed?.sequence ?? null,
        serialTo: dto.serialTo,
        serialToPrefix: serialToParsed === undefined ? undefined : serialToParsed?.prefix ?? null,
        serialToSequence: serialToParsed === undefined ? undefined : serialToParsed?.sequence ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        explicitExclusion: dto.explicitExclusion,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "APPLICABILITY_RULE_UPDATED",
      objectType: "ApplicabilityRule",
      objectId: id,
      before: this.serializeForAudit(before),
      after: this.serializeForAudit(updated),
    });

    return updated;
  }

  async remove(organizationId: string, revisionId: string, id: string, actorId: string) {
    const revision = await this.requireRevision(organizationId, revisionId);
    this.assertMutable(revision);
    const rule = await this.prisma.applicabilityRule.findFirst({ where: { id, organizationId, revisionId } });
    if (!rule) throw new AppError("NOT_FOUND", "Applicability rule not found");

    await this.prisma.applicabilityRule.delete({ where: { id } });

    await this.audit.record({
      organizationId,
      actorId,
      action: "APPLICABILITY_RULE_DELETED",
      objectType: "ApplicabilityRule",
      objectId: id,
      before: this.serializeForAudit(rule),
    });
  }

  private assertMutable(revision: { status: string }) {
    // Rules may only be edited while the owning revision hasn't yet been
    // published (spec: once published, the frozen snapshot is what matters
    // — editing rules on an already-approved/published revision would be
    // silently ignored by resolution, which is worse than blocking it).
    if (revision.status === "RETIRED") {
      throw new AppError("INVALID_STATE_TRANSITION", "Cannot modify applicability rules on a retired revision");
    }
  }

  private async requireRevision(organizationId: string, revisionId: string) {
    const revision = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, organizationId } });
    if (!revision) throw new AppError("NOT_FOUND", "Document revision not found");
    return revision;
  }

  // Allow a fully-unscoped rule (all fields null) — that's a deliberate,
  // explicit org-wide rule (specificity 0). Otherwise, cross-check that any
  // referenced entity actually belongs to this organization.
  private async crossCheckScope(
    organizationId: string,
    dto: Partial<CreateApplicabilityRuleDto>,
  ) {
    if (dto.productFamilyId) {
      const found = await this.prisma.productFamily.findFirst({ where: { id: dto.productFamilyId, organizationId } });
      if (!found) throw new AppError("TENANT_VIOLATION", "Product family not found in this organization");
    }
    if (dto.productId) {
      const found = await this.prisma.product.findFirst({ where: { id: dto.productId, organizationId } });
      if (!found) throw new AppError("TENANT_VIOLATION", "Product not found in this organization");
    }
    if (dto.variantId) {
      const found = await this.prisma.productVariant.findFirst({ where: { id: dto.variantId, organizationId } });
      if (!found) throw new AppError("TENANT_VIOLATION", "Variant not found in this organization");
    }
    if (dto.batchId) {
      const found = await this.prisma.batch.findFirst({ where: { id: dto.batchId, organizationId } });
      if (!found) throw new AppError("TENANT_VIOLATION", "Batch not found in this organization");
    }
    if (dto.unitId) {
      const found = await this.prisma.unit.findFirst({ where: { id: dto.unitId, organizationId } });
      if (!found) throw new AppError("TENANT_VIOLATION", "Unit not found in this organization");
    }
  }

  private serializeForAudit(rule: Record<string, unknown>) {
    return {
      ...rule,
      serialFromSequence: rule.serialFromSequence != null ? String(rule.serialFromSequence) : null,
      serialToSequence: rule.serialToSequence != null ? String(rule.serialToSequence) : null,
    };
  }
}
