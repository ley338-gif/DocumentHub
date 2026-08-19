import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { slugify } from "../common/slugify";
import { normalizePagination, toPaginated } from "../common/pagination";
import { PlatformAuditService } from "./platform-audit.service";
import { InvitationsService } from "../invitations/invitations.service";
import { CreateTenantDto, UpdateTenantStatusDto } from "./dto/create-tenant.dto";
import { ListTenantsQueryDto } from "./dto/list-tenants.dto";

const STATUS_ACTION: Record<string, string> = {
  ACTIVE: "PLATFORM_TENANT_ACTIVATED",
  SUSPENDED: "PLATFORM_TENANT_SUSPENDED",
  CLOSED: "PLATFORM_TENANT_CLOSED",
  TRIAL: "PLATFORM_TENANT_TRIAL_STARTED",
};

@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
    private readonly invitations: InvitationsService,
  ) {}

  async list(query: ListTenantsQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where: Prisma.OrganizationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              memberships: { where: { status: "ACTIVE" } },
              products: true,
              units: true,
              documents: true,
              publications: { where: { status: "ACTIVE" } },
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const storageMap = await this.storageByOrganization(organizations.map((o) => o.id));

    const items = organizations.map((o) => ({
      id: o.id,
      stableId: o.stableId,
      name: o.name,
      slug: o.slug,
      status: o.status,
      createdAt: o.createdAt,
      users: o._count.memberships,
      products: o._count.products,
      units: o._count.units,
      documents: o._count.documents,
      activePublications: o._count.publications,
      storageBytes: storageMap.get(o.id) ?? 0,
    }));

    return toPaginated(items, total, page, pageSize);
  }

  async detail(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: { where: { status: "ACTIVE" } },
            products: true,
            variants: true,
            units: true,
            documents: true,
            documentRevisions: true,
            publications: { where: { status: "ACTIVE" } },
          },
        },
      },
    });
    if (!organization) throw new AppError("NOT_FOUND", "Tenant not found");

    const storageMap = await this.storageByOrganization([id]);

    return {
      id: organization.id,
      stableId: organization.stableId,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      defaultLanguage: organization.defaultLanguage,
      timezone: organization.timezone,
      createdAt: organization.createdAt,
      usage: {
        users: organization._count.memberships,
        products: organization._count.products,
        variants: organization._count.variants,
        units: organization._count.units,
        documents: organization._count.documents,
        revisions: organization._count.documentRevisions,
        activePublications: organization._count.publications,
        storageBytes: storageMap.get(id) ?? 0,
      },
    };
  }

  async usage(id: string) {
    return (await this.detail(id)).usage;
  }

  /** Platform Dashboard KPIs (spec §11) — every figure here is a real
   * aggregate query, never a placeholder. If a figure can't be computed
   * cheaply and correctly, it's left out rather than faked. */
  async dashboardSummary() {
    const [tenantsByStatus, users, products, units, documents, activePublications, storage] = await Promise.all([
      this.prisma.organization.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.unit.count(),
      this.prisma.document.count(),
      this.prisma.publication.count({ where: { status: "ACTIVE" } }),
      this.prisma.documentRevision.aggregate({ _sum: { fileSize: true } }),
    ]);

    const byStatus = Object.fromEntries(tenantsByStatus.map((row) => [row.status, row._count._all]));
    const totalTenants = tenantsByStatus.reduce((sum, row) => sum + row._count._all, 0);

    return {
      tenants: {
        total: totalTenants,
        active: byStatus.ACTIVE ?? 0,
        trial: byStatus.TRIAL ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        closed: byStatus.CLOSED ?? 0,
      },
      users,
      products,
      units,
      documents,
      activePublications,
      storageBytes: storage._sum.fileSize ?? 0,
    };
  }

  async create(actorId: string, dto: CreateTenantDto) {
    const baseSlug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    let slug = baseSlug || "tenant";
    let attempt = 0;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        status: "TRIAL",
        defaultLanguage: dto.defaultLanguage ?? "de",
        timezone: dto.timezone ?? "UTC",
      },
    });

    const { invitation, token } = await this.invitations.create(organization.id, actorId, {
      email: dto.adminEmail,
      role: "ADMINISTRATOR",
    });

    await this.platformAudit.record({
      actorId,
      action: "PLATFORM_TENANT_CREATED",
      targetType: "Organization",
      targetId: organization.id,
      after: { name: organization.name, slug: organization.slug, adminEmail: dto.adminEmail },
    });

    return { tenant: organization, invitation, invitationToken: token };
  }

  async updateStatus(id: string, actorId: string, dto: UpdateTenantStatusDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    if (!organization) throw new AppError("NOT_FOUND", "Tenant not found");

    const before = { status: organization.status };
    const updated = await this.prisma.organization.update({ where: { id }, data: { status: dto.status } });

    await this.platformAudit.record({
      actorId,
      action: STATUS_ACTION[dto.status] ?? "PLATFORM_TENANT_STATUS_CHANGED",
      targetType: "Organization",
      targetId: id,
      before,
      after: { status: updated.status },
    });

    // Tenant-visible lifecycle note (spec §30) — Platform Audit above remains
    // the authoritative operator record; this just keeps the tenant's own
    // history honest about why their status changed.
    await this.prisma.auditEvent.create({
      data: {
        organizationId: id,
        actorId,
        action: "TENANT_STATUS_CHANGED",
        objectType: "Organization",
        objectId: id,
        before,
        after: { status: updated.status },
      },
    });

    return updated;
  }

  private async storageByOrganization(organizationIds: string[]): Promise<Map<string, number>> {
    if (organizationIds.length === 0) return new Map();
    const sums = await this.prisma.documentRevision.groupBy({
      by: ["organizationId"],
      _sum: { fileSize: true },
      where: { organizationId: { in: organizationIds } },
    });
    return new Map(sums.map((s) => [s.organizationId, s._sum.fileSize ?? 0]));
  }
}
