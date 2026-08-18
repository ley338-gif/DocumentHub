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
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
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
      ...(query.from || query.to
        ? {
            timestamp: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return toPaginated(items, total, page, pageSize);
  }
}
