import { Injectable } from "@nestjs/common";
import { PublicationSnapshot } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { parseSerial } from "../applicability/serial";
import { AppliedRuleSnapshot, UnitContext } from "../applicability/applicability.types";
import { ruleMatchesUnitContext, ruleScopeMatches, specificity } from "../applicability/specificity";
import { ConflictGroup, ResolutionResult, ResolveInput } from "./resolver.types";

/**
 * The single source of truth for "what documents apply to this unit right
 * now (or as of some point in the past)". Reads ONLY from Publication +
 * PublicationSnapshot — never from live ApplicabilityRule/Product/Unit
 * tables for the matching decision itself. Live Unit/Product rows may only
 * be read to resolve identity (unitId -> productId/variantId/batchId/
 * serial), never to read current applicability. This is what makes
 * historical resolution and snapshot immutability (spec §27, §71) correct.
 */
@Injectable()
export class PublicationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePublications(input: ResolveInput): Promise<ResolutionResult> {
    const context = await this.buildUnitContext(input);

    const candidates = await this.prisma.publication.findMany({
      where: {
        organizationId: input.organizationId,
        publishedAt: { lte: input.effectiveAt },
        AND: [
          { OR: [{ supersededAt: null }, { supersededAt: { gt: input.effectiveAt } }] },
          { OR: [{ revokedAt: null }, { revokedAt: { gt: input.effectiveAt } }] },
        ],
      },
      include: { snapshot: true },
    });

    type Match = { snapshot: PublicationSnapshot; matchedSpecificity: number };
    const matches: Match[] = [];

    for (const pub of candidates) {
      if (!pub.snapshot) continue;
      const snapshot = pub.snapshot;
      if (input.language && snapshot.language !== input.language) continue;

      const rules = snapshot.applicabilityRules as unknown as AppliedRuleSnapshot[];

      let excluded = false;
      let maxSpecificity = -1;

      for (const rule of rules) {
        if (rule.explicitExclusion) {
          if (ruleScopeMatches(rule, context, input.effectiveAt)) {
            excluded = true;
            break;
          }
          continue;
        }
        if (ruleMatchesUnitContext(rule, context, input.effectiveAt)) {
          maxSpecificity = Math.max(maxSpecificity, specificity(rule));
        }
      }

      if (excluded || maxSpecificity < 0) continue;
      matches.push({ snapshot, matchedSpecificity: maxSpecificity });
    }

    const groups = new Map<string, Match[]>();
    for (const match of matches) {
      const key = `${match.snapshot.documentId}::${match.snapshot.language}`;
      const list = groups.get(key) ?? [];
      list.push(match);
      groups.set(key, list);
    }

    const resolved: PublicationSnapshot[] = [];
    const conflicts: ConflictGroup[] = [];

    for (const [key, group] of groups) {
      const maxSpecificity = Math.max(...group.map((m) => m.matchedSpecificity));
      const top = group.filter((m) => m.matchedSpecificity === maxSpecificity);
      const distinctRevisions = new Set(top.map((m) => m.snapshot.documentRevisionId));

      if (distinctRevisions.size === 1) {
        resolved.push(top[0].snapshot);
      } else {
        conflicts.push({ resolutionKey: key, candidates: top.map((m) => m.snapshot) });
      }
    }

    return { resolved, conflicts };
  }

  private async buildUnitContext(input: ResolveInput): Promise<UnitContext> {
    if (input.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: input.unitId, organizationId: input.organizationId },
        include: { product: true },
      });
      if (!unit) throw new AppError("NOT_FOUND", "Unit not found");

      return {
        unitId: unit.id,
        productId: unit.productId,
        productFamilyId: unit.product.productFamilyId,
        variantId: unit.variantId,
        batchId: unit.batchId,
        parsedSerial: { prefix: unit.serialPrefix, sequence: unit.serialSequence, sequenceLength: unit.serialSeqLength },
      };
    }

    if (!input.productId) {
      throw new AppError("VALIDATION_ERROR", "Either unitId or productId is required to resolve publications");
    }

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, organizationId: input.organizationId },
    });
    if (!product) throw new AppError("NOT_FOUND", "Product not found");

    return {
      unitId: null,
      productId: product.id,
      productFamilyId: product.productFamilyId,
      variantId: input.variantId ?? null,
      batchId: input.batchId ?? null,
      parsedSerial: input.serialNumber ? parseSerial(input.serialNumber) : null,
    };
  }
}
