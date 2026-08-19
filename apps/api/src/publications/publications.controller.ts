import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { AppError } from "../common/errors/app-error";
import { normalizePagination, toPaginated } from "../common/pagination";
import { PublishService } from "./publish.service";
import { PublicationResolverService } from "./resolver.service";
import { PublishPreviewService } from "./publish-preview.service";
import { PublicationListQueryDto, PublishRevisionDto, ResolveQueryDto } from "./dto/publications-dtos";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("publications")
export class PublicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: PublishService,
    private readonly resolver: PublicationResolverService,
    private readonly preview: PublishPreviewService,
  ) {}

  @Roles("VIEWER")
  @Get()
  async list(@Tenant() tenant: TenantContext, @Query() query: PublicationListQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = {
      organizationId: tenant.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...((query.from || query.to)
        ? { publishedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
      // Both documentId and productId filter through the snapshot — the
      // immutable frozen record, never the live revision/rule tables — so
      // filtering never changes what a publication "was about" after the
      // fact. productId matches scopedProductIds, populated at publish time
      // (see PublishService, and scopedProductIds' doc comment in
      // schema.prisma for the narrow "direct productId rules only" scope).
      ...(query.documentId || query.productId
        ? {
            snapshot: {
              ...(query.documentId ? { documentId: query.documentId } : {}),
              ...(query.productId ? { scopedProductIds: { has: query.productId } } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.publication.findMany({ where, include: { snapshot: true }, skip, take, orderBy: { publishedAt: "desc" } }),
      this.prisma.publication.count({ where }),
    ]);
    const enriched = await this.withActorNames(tenant.organizationId, items);
    return toPaginated(enriched, total, page, pageSize);
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

  @Roles("EDITOR")
  @Get("preview/:revisionId")
  publishPreview(@Tenant() tenant: TenantContext, @Param("revisionId") revisionId: string) {
    return this.preview.preview(tenant.organizationId, revisionId);
  }

  // Must be registered after the static-prefixed "resolve"/"preview/:x"
  // routes above, otherwise NestJS would match ":id" against those path
  // segments first.
  @Roles("VIEWER")
  @Get(":id")
  async get(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: { snapshot: true },
    });
    if (!publication) throw new AppError("NOT_FOUND", "Publication not found");
    const [enriched] = await this.withActorNames(tenant.organizationId, [publication]);
    return enriched;
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

  // Batch-resolves publishedBy/revokedBy display names for a page of
  // Publications — Publication.publishedById/revokedById are plain string
  // columns (no Prisma relation to User), so this is a deliberate second
  // query, never one lookup per row. Looked up via OrganizationMembership
  // (not User directly) so a name never leaks for a user who was never a
  // member of this organization.
  private async withActorNames<T extends { publishedById: string; revokedById: string | null }>(
    organizationId: string,
    publications: T[],
  ): Promise<(T & { publishedByName: string | null; revokedByName: string | null })[]> {
    const ids = new Set<string>();
    for (const p of publications) {
      ids.add(p.publishedById);
      if (p.revokedById) ids.add(p.revokedById);
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId, userId: { in: [...ids] } },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    const names = new Map(memberships.map((m) => [m.user.id, m.user.fullName || m.user.email]));
    return publications.map((p) => ({
      ...p,
      publishedByName: names.get(p.publishedById) ?? null,
      revokedByName: p.revokedById ? (names.get(p.revokedById) ?? null) : null,
    }));
  }
}
