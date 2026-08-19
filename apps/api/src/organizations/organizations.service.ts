import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { UpdateMemberStatusDto } from "./dto/update-member-status.dto";
import { slugify } from "../common/slugify";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const baseSlug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    let slug = baseSlug || "org";
    let attempt = 0;
    // Ensure slug uniqueness with a small suffix loop rather than failing outright.
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.name, slug },
      });
      await tx.organizationMembership.create({
        data: { userId, organizationId: organization.id, role: "ADMINISTRATOR" },
      });
      await this.audit.record(
        {
          organizationId: organization.id,
          actorId: userId,
          action: "ORGANIZATION_CREATED",
          objectType: "Organization",
          objectId: organization.id,
          after: { name: organization.name, slug: organization.slug },
        },
        tx,
      );
      return organization;
    });

    return org;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true },
    });
    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      user: { id: m.user.id, email: m.user.email, fullName: m.user.fullName },
    }));
  }

  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    actorId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw new AppError("NOT_FOUND", "Membership not found");
    }

    // Last-Administrator Protection (spec §23-24): applies to self-changes
    // too — a tenant admin can't accidentally strip their own admin role if
    // they're the only one left, same as they can't do it to anyone else.
    if (membership.role === "ADMINISTRATOR" && dto.role !== "ADMINISTRATOR" && membership.status === "ACTIVE") {
      await this.assertNotLastActiveAdmin(organizationId, membershipId);
    }

    const before = { role: membership.role };
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { role: dto.role },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "MEMBER_ROLE_CHANGED",
      objectType: "OrganizationMembership",
      objectId: membershipId,
      before,
      after: { role: updated.role },
    });

    return updated;
  }

  async updateMemberStatus(
    organizationId: string,
    membershipId: string,
    actorId: string,
    dto: UpdateMemberStatusDto,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw new AppError("NOT_FOUND", "Membership not found");
    }
    if (membership.status === "INVITED") {
      throw new AppError("INVALID_STATE_TRANSITION", "An invited-but-not-yet-active membership has no status to change");
    }

    if (dto.status === "SUSPENDED" && membership.role === "ADMINISTRATOR" && membership.status === "ACTIVE") {
      await this.assertNotLastActiveAdmin(organizationId, membershipId);
    }

    const before = { status: membership.status };
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { status: dto.status },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: dto.status === "SUSPENDED" ? "MEMBER_SUSPENDED" : "MEMBER_REACTIVATED",
      objectType: "OrganizationMembership",
      objectId: membershipId,
      before,
      after: { status: updated.status },
    });

    return updated;
  }

  /** Throws LAST_ADMIN_PROTECTED if `excludeMembershipId` is (or would be)
   * the organization's only remaining active ADMINISTRATOR. Shared by both
   * the role-change and status-change paths, and applies identically
   * whether the actor is changing someone else's membership or their own. */
  private async assertNotLastActiveAdmin(organizationId: string, excludeMembershipId: string) {
    const otherActiveAdmins = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        role: "ADMINISTRATOR",
        status: "ACTIVE",
        id: { not: excludeMembershipId },
      },
    });
    if (otherActiveAdmins === 0) {
      throw new AppError("LAST_ADMIN_PROTECTED", "This organization must keep at least one active administrator");
    }
  }
}
