import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination, toPaginated } from "../common/pagination";
import { ListPlatformAuditQueryDto } from "./dto/list-platform-audit.dto";
import { getRequestContext } from "../common/request-context-store";

export interface RecordPlatformAuditEventInput {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * The platform operator's own append-only audit trail — see
 * docs/platform-administration.md "Platform Audit". Never write platform
 * actions into the tenant-scoped AuditEvent table; this is the authoritative
 * operator history, independent of any single tenant's record.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordPlatformAuditEventInput) {
    // See AuditService.record()'s equivalent comment — same ambient
    // request-context fallback, same reasoning.
    const ctx = getRequestContext();
    await this.prisma.platformAuditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: input.before === undefined ? Prisma.JsonNull : (input.before as Prisma.InputJsonValue),
        after: input.after === undefined ? Prisma.JsonNull : (input.after as Prisma.InputJsonValue),
        requestId: input.requestId ?? ctx?.requestId ?? null,
        ipAddress: input.ipAddress ?? ctx?.ipAddress ?? null,
        userAgent: input.userAgent ?? ctx?.userAgent ?? null,
      },
    });
  }

  async list(query: ListPlatformAuditQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where: Prisma.PlatformAuditEventWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;

    const [events, total] = await Promise.all([
      this.prisma.platformAuditEvent.findMany({ where, skip, take, orderBy: { timestamp: "desc" } }),
      this.prisma.platformAuditEvent.count({ where }),
    ]);

    return toPaginated(events, total, page, pageSize);
  }
}
