import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { normalizePagination, PaginationQueryDto, toPaginated } from "../common/pagination";
import { CreateDocumentDto, UpdateDocumentDto } from "./dto/document-dtos";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.document.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async get(organizationId: string, id: string) {
    return this.require(organizationId, id);
  }

  async create(organizationId: string, actorId: string, dto: CreateDocumentDto) {
    const doc = await this.prisma.document.create({
      data: { organizationId, name: dto.name, documentType: dto.documentType, description: dto.description },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "DOCUMENT_CREATED",
      objectType: "Document",
      objectId: doc.id,
      after: doc,
    });
    return doc;
  }

  async update(organizationId: string, id: string, actorId: string, dto: UpdateDocumentDto) {
    const before = await this.require(organizationId, id);
    const updated = await this.prisma.document.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId,
      actorId,
      action: "DOCUMENT_UPDATED",
      objectType: "Document",
      objectId: id,
      before,
      after: updated,
    });
    return updated;
  }

  async require(organizationId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!doc) throw new AppError("NOT_FOUND", "Document not found");
    return doc;
  }
}
