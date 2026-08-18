import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { normalizePagination, toPaginated } from "../common/pagination";
import { PublishService } from "./publish.service";
import { PublicationResolverService } from "./resolver.service";
import { PublicationListQueryDto, PublishRevisionDto, ResolveQueryDto } from "./dto/publications-dtos";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("publications")
export class PublicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: PublishService,
    private readonly resolver: PublicationResolverService,
  ) {}

  @Roles("VIEWER")
  @Get()
  async list(@Tenant() tenant: TenantContext, @Query() query: PublicationListQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = {
      organizationId: tenant.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.documentId ? { snapshot: { documentId: query.documentId } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.publication.findMany({ where, include: { snapshot: true }, skip, take, orderBy: { publishedAt: "desc" } }),
      this.prisma.publication.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  @Roles("VIEWER")
  @Get("resolve")
  resolve(@Tenant() tenant: TenantContext, @Query() query: ResolveQueryDto) {
    return this.resolver.resolvePublications({
      organizationId: tenant.organizationId,
      productId: query.productId,
      variantId: query.variantId,
      batchId: query.batchId,
      unitId: query.unitId,
      serialNumber: query.serialNumber,
      language: query.language,
      effectiveAt: query.effectiveAt ? new Date(query.effectiveAt) : new Date(),
    });
  }

  @Roles("PUBLISHER")
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishRevisionDto,
  ) {
    return this.publish.publish(tenant.organizationId, dto.revisionId, user.userId, tenant.role);
  }

  @Roles("PUBLISHER")
  @Patch(":id/revoke")
  revoke(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.publish.revoke(tenant.organizationId, id, user.userId);
  }
}
