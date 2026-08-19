import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { TenantContext } from "../common/request-context";
import { PaginationQueryDto, normalizePagination, toPaginated } from "../common/pagination";

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  objectType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Free-text, matched (case-insensitive) against action/objectType/objectId
  // — deliberately not a full-text index across `before`/`after` JSON,
  // which would be a much bigger feature; documented scope for the MVP.
  @IsOptional()
  @IsString()
  search?: string;
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles("VIEWER")
  @Get()
  async list(@Tenant() tenant: TenantContext, @Query() query: AuditQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = {
      organizationId: tenant.organizationId,
      ...(query.objectType ? { objectType: query.objectType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            timestamp: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: "insensitive" as const } },
              { objectType: { contains: query.search, mode: "insensitive" as const } },
              { objectId: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      this.prisma.auditEvent.count({ where }),
    ]);

    const enriched = await this.withActorNames(tenant.organizationId, items);
    return toPaginated(enriched, total, page, pageSize);
  }

  // Same pattern as PublicationsController.withActorNames — AuditEvent.actorId
  // is a plain string (no relation, and nullable for system-initiated
  // events), resolved via OrganizationMembership so a name never leaks for
  // a non-member.
  private async withActorNames<T extends { actorId: string | null }>(
    organizationId: string,
    events: T[],
  ): Promise<(T & { actorName: string | null })[]> {
    const ids = new Set<string>();
    for (const e of events) if (e.actorId) ids.add(e.actorId);
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId, userId: { in: [...ids] } },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    const names = new Map(memberships.map((m) => [m.user.id, m.user.fullName || m.user.email]));
    return events.map((e) => ({ ...e, actorName: e.actorId ? (names.get(e.actorId) ?? null) : null }));
  }
}
