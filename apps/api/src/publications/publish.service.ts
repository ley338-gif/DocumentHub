import { Injectable } from "@nestjs/common";
import { MembershipRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { AppliedRuleSnapshot } from "../applicability/applicability.types";
import { toAppliedRuleSnapshot } from "../applicability/to-applied-rule-snapshot";
import { findConflicts } from "./conflict-detection";

const HIERARCHY: Record<MembershipRole, number> = { VIEWER: 0, EDITOR: 1, PUBLISHER: 2, ADMINISTRATOR: 3 };

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async publish(organizationId: string, revisionId: string, actorId: string, actorRole: MembershipRole) {
    // Defense in depth — the controller already enforces @Roles("PUBLISHER"),
    // but a publish is significant enough to double-check server-side here.
    if (HIERARCHY[actorRole] < HIERARCHY.PUBLISHER) {
      throw new AppError("FORBIDDEN", "Publisher role or higher is required to publish");
    }

    return this.prisma.$transaction(
      async (tx) => {
        const revision = await tx.documentRevision.findFirst({
          where: { id: revisionId, organizationId },
          include: { document: true },
        });
        if (!revision) throw new AppError("NOT_FOUND", "Document revision not found");
        if (revision.status !== "APPROVED") {
          throw new AppError("INVALID_STATE_TRANSITION", "Only an APPROVED revision can be published");
        }

        // Advisory lock keyed on (organizationId, documentId, language) so
        // two concurrent publishes for the same resolution key can't race
        // past the conflict check simultaneously.
        const lockKey = `${organizationId}::${revision.documentId}::${revision.language}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const liveRules = await tx.applicabilityRule.findMany({ where: { organizationId, revisionId } });
        const newRuleSnapshots: AppliedRuleSnapshot[] = liveRules.map(toAppliedRuleSnapshot);

        const conflicts = await findConflicts(tx, organizationId, revision.documentId, revision.language, newRuleSnapshots);
        if (conflicts.length > 0) {
          const [first] = conflicts;
          throw new AppError(
            "APPLICABILITY_CONFLICT",
            `New applicability rules conflict with an existing active publication (${first.existingPublicationStableId}) at equal specificity`,
            { conflicts },
          );
        }

        const publication = await tx.publication.create({
          data: {
            organizationId,
            documentRevisionId: revision.id,
            status: "ACTIVE",
            publishedById: actorId,
          },
        });

        const snapshot = await tx.publicationSnapshot.create({
          data: {
            publicationId: publication.id,
            organizationId,
            documentId: revision.documentId,
            documentStableId: revision.document.stableId,
            documentRevisionId: revision.id,
            documentName: revision.document.name,
            documentType: revision.document.documentType,
            revision: revision.revision,
            language: revision.language,
            filename: revision.originalFilename,
            mimeType: revision.mimeType,
            fileSize: revision.fileSize,
            sha256: revision.sha256,
            storageKey: revision.storageKey,
            applicabilityRules: newRuleSnapshots as unknown as Prisma.InputJsonValue,
            publishedAt: publication.publishedAt,
            publishedById: actorId,
          },
        });

        await this.audit.record(
          {
            organizationId,
            actorId,
            action: "PUBLICATION_CREATED",
            objectType: "Publication",
            objectId: publication.id,
            after: { documentRevisionId: revision.id, documentId: revision.documentId, language: revision.language },
          },
          tx,
        );

        return { ...publication, snapshot };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revoke(organizationId: string, publicationId: string, actorId: string) {
    const publication = await this.prisma.publication.findFirst({ where: { id: publicationId, organizationId } });
    if (!publication) throw new AppError("NOT_FOUND", "Publication not found");
    if (publication.status !== "ACTIVE") {
      throw new AppError("INVALID_STATE_TRANSITION", "Only an ACTIVE publication can be revoked");
    }

    const updated = await this.prisma.publication.update({
      where: { id: publicationId },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: actorId },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "PUBLICATION_REVOKED",
      objectType: "Publication",
      objectId: publicationId,
      before: { status: "ACTIVE" },
      after: { status: "REVOKED" },
    });

    return updated;
  }
}
