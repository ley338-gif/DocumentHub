import { Inject, Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { STORAGE_SERVICE, StorageService } from "../storage/storage.service";
import { CreateRevisionMetaDto } from "./dto/document-dtos";
import { RevisionStatus } from "@prisma/client";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_MIME_TYPES = new Set(["application/pdf"]);

const TRANSITIONS: Record<RevisionStatus, RevisionStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED"],
  APPROVED: ["RETIRED"],
  RETIRED: [],
};

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base : "file";
}

@Injectable()
export class RevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(
    organizationId: string,
    documentId: string,
    actorId: string,
    dto: CreateRevisionMetaDto,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!document) throw new AppError("NOT_FOUND", "Document not found");

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppError("FILE_VALIDATION_FAILED", "No file uploaded");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError("FILE_VALIDATION_FAILED", "File exceeds maximum allowed size (100MB)");
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new AppError("FILE_VALIDATION_FAILED", `Unsupported file type: ${file.mimetype}`);
    }

    const existing = await this.prisma.documentRevision.findUnique({
      where: { documentId_revision_language: { documentId, revision: dto.revision, language: dto.language } },
    });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "This revision/language already exists for this document");
    }

    // sha256 computed over the actual buffer being stored — never trust a
    // client-supplied hash or the filename.
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const revisionId = crypto.randomUUID();
    const storageKey = `org/${organizationId}/documents/${documentId}/${revisionId}/${sanitizeFilename(file.originalname)}`;

    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const revision = await this.prisma.documentRevision.create({
      data: {
        id: revisionId,
        organizationId,
        documentId,
        revision: dto.revision,
        language: dto.language,
        storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        sha256,
        status: "DRAFT",
        uploadedById: actorId,
        internalNote: dto.internalNote,
        changeDescription: dto.changeDescription,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "REVISION_CREATED",
      objectType: "DocumentRevision",
      objectId: revision.id,
      after: { documentId, revision: dto.revision, language: dto.language, sha256, fileSize: file.size },
    });

    return revision;
  }

  async list(organizationId: string, documentId: string) {
    await this.requireDocument(organizationId, documentId);
    return this.prisma.documentRevision.findMany({ where: { organizationId, documentId }, orderBy: { createdAt: "desc" } });
  }

  async get(organizationId: string, id: string) {
    return this.requireRevision(organizationId, id);
  }

  async downloadFile(organizationId: string, id: string) {
    const revision = await this.requireRevision(organizationId, id);
    const buffer = await this.storage.get(revision.storageKey);
    return { buffer, revision };
  }

  async submit(organizationId: string, id: string, actorId: string) {
    return this.transition(organizationId, id, actorId, "IN_REVIEW", "REVISION_SUBMITTED");
  }

  async approve(organizationId: string, id: string, actorId: string) {
    return this.transition(organizationId, id, actorId, "APPROVED", "REVISION_APPROVED");
  }

  async retire(organizationId: string, id: string, actorId: string) {
    return this.transition(organizationId, id, actorId, "RETIRED", "REVISION_RETIRED");
  }

  private async transition(
    organizationId: string,
    id: string,
    actorId: string,
    target: RevisionStatus,
    action: string,
  ) {
    const revision = await this.requireRevision(organizationId, id);
    const allowed = TRANSITIONS[revision.status] ?? [];
    if (!allowed.includes(target)) {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        `Cannot transition revision from ${revision.status} to ${target}`,
      );
    }

    const updated = await this.prisma.documentRevision.update({ where: { id }, data: { status: target } });

    await this.audit.record({
      organizationId,
      actorId,
      action,
      objectType: "DocumentRevision",
      objectId: id,
      before: { status: revision.status },
      after: { status: updated.status },
    });

    return updated;
  }

  // Whether the immutable fields of a revision (storageKey/sha256/revision/
  // language/documentId) may still be changed. Once a revision is APPROVED
  // or beyond, OR has ever been used in a Publication, those fields are
  // frozen — this is the more conservative of the two rules offered in the
  // brief.
  async assertContentMutable(organizationId: string, id: string) {
    const revision = await this.prisma.documentRevision.findFirst({
      where: { id, organizationId },
      include: { publications: { select: { id: true }, take: 1 } },
    });
    if (!revision) throw new AppError("NOT_FOUND", "Document revision not found");

    const frozen = revision.status === "APPROVED" || revision.status === "RETIRED" || revision.publications.length > 0;
    if (frozen) {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        "This revision's file identity is immutable once approved or published",
      );
    }
    return revision;
  }

  private async requireDocument(organizationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, organizationId } });
    if (!doc) throw new AppError("NOT_FOUND", "Document not found");
    return doc;
  }

  private async requireRevision(organizationId: string, id: string) {
    const revision = await this.prisma.documentRevision.findFirst({ where: { id, organizationId } });
    if (!revision) throw new AppError("NOT_FOUND", "Document revision not found");
    return revision;
  }
}
